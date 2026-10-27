import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Session, SessionStatus } from '../sessions/entities/session.entity';
import { BankTransfer } from '../billing/entities/bank-transfer.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Player } from '../players/entities/player.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { naira, shortDate } from '../common/format.util';
import { paidByTransfer, releaseToExtra } from './credit';
import { usePartPaid } from './part-paid';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    private notifications: NotificationsService,
  ) {}

  /** "We got your ₦5,000 ✅" to each player, and a heads-up to organisers for transfers. */
  async sendReceipts(paymentIds: string[], source: 'manual' | 'transfer') {
    if (!paymentIds.length) return;
    const payments = await this.paymentsRepo.find({
      where: { id: In(paymentIds) },
      relations: ['player', 'session', 'session.group'],
    });
    for (const p of payments) {
      const what = p.session.label ? `${p.session.label} dues` : `the ${shortDate(p.session.date)} game`;
      await this.notifications.notifyPlayers([p.playerId], {
        kind: 'receipt',
        title: `We got your ${naira(p.amount)} ✅`,
        body: `${p.session.group.name} — ${what} is paid. Thanks!`,
        url: '/me',
        critical: true,
      });
    }
    if (source === 'transfer' && payments.length) {
      const total = Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
      const first = payments[0];
      await this.notifications.notifyOrganisers(first.session.group.organizationId, {
        kind: 'payment_received',
        title: `${naira(total)} received`,
        body: `${first.player.firstName} ${first.player.lastName} · ${first.session.group.name}`,
        url: `/sessions/${first.sessionId}`,
      });
    }
  }

  async create(dto: CreatePaymentDto, organizationId: string) {
    // Verify session belongs to org
    const session = await this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoin('session.group', 'group')
      .where('session.id = :id', { id: dto.sessionId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!session) throw new NotFoundException('Game not found');
    const inClub = await this.paymentsRepo.manager.getRepository(Player).exists({ where: { id: dto.playerId, organizationId } });
    if (!inClub) throw new NotFoundException('Player not found');

    const payment = this.paymentsRepo.create(dto);
    if (dto.status === PaymentStatus.PAID) {
      payment.paidAt = new Date();
    }
    const saved = await this.paymentsRepo.save(payment);

    await this.recalculateSessionTotal(dto.sessionId);
    return saved;
  }

  async markAsPaid(id: string, organizationId: string, markedBy?: string, source?: 'cash' | 'manual') {
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PAID) return payment;

    // Lock the row and re-check inside the transaction to prevent double credit consumption.
    const saved = await this.paymentsRepo.manager.transaction(async (tx) => {
      const locked = await tx.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.status === PaymentStatus.PAID) return payment;
      await usePartPaid(tx, payment, payment.session.groupId);
      payment.status = PaymentStatus.PAID;
      payment.paidAt = new Date();
      payment.source = source ?? 'manual';
      if (markedBy) payment.markedBy = markedBy;
      return tx.save(payment);
    });

    await this.recalculateSessionTotal(payment.sessionId);
    this.notifications.later(() => this.sendReceipts([saved.id], 'manual'));
    return saved;
  }

  async markAsUnpaid(id: string, organizationId: string) {
    const payment = await this.ownedPayment(id, organizationId);
    if (payment.status === PaymentStatus.PENDING) return payment;

    const saved = await this.paymentsRepo.manager.transaction(async (tx) => {
      const locked = await tx.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.status === PaymentStatus.PENDING) return payment;
      // Undoing a payment that came by transfer: that money is still in the account, so it goes
      // to the player's extra to sort, rather than vanishing from the books or paying a game.
      await releaseToExtra(tx, payment.session.groupId, [payment]);
      payment.status = PaymentStatus.PENDING;
      if (payment.attendance === 'no_show') payment.attendance = 'came';
      payment.paidAt = null;
      payment.source = null;
      payment.markedBy = null;
      payment.fromCredit = '0';
      return tx.save(payment);
    });

    await this.recalculateSessionTotal(payment.sessionId);
    return saved;
  }

  async findBySession(sessionId: string, organizationId: string) {
    return this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .leftJoinAndSelect('payment.player', 'player')
      .where('payment.sessionId = :sessionId', { sessionId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getMany();
  }

  async findByPlayer(playerId: string, organizationId: string) {
    return this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoinAndSelect('session.group', 'group')
      .where('payment.playerId = :playerId', { playerId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .orderBy('payment.createdAt', 'DESC')
      .getMany();
  }

  async waive(id: string, organizationId: string, waivedBy?: string) {
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.WAIVED) return payment;

    const saved = await this.paymentsRepo.manager.transaction(async (tx) => {
      const locked = await tx.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.status === PaymentStatus.WAIVED) return payment;
      // Waiving a due they'd already paid by transfer: the money goes to their extra to sort
      // instead of vanishing from the books.
      await releaseToExtra(tx, payment.session.groupId, [payment]);
      payment.status = PaymentStatus.WAIVED;
      payment.attendance = 'came';
      if (waivedBy) payment.markedBy = waivedBy;
      return tx.save(payment);
    });

    await this.recalculateSessionTotal(payment.sessionId);
    return saved;
  }

  /**
   * Said they were in and didn't come: nothing to pay. Anything they'd paid by transfer goes to
   * their extra to sort. Kept on the list (for the record), not chased.
   */
  async markNoShow(id: string, organizationId: string, markedBy?: string) {
    const payment = await this.ownedPayment(id, organizationId);
    if (payment.attendance === 'no_show') return payment;

    const saved = await this.paymentsRepo.manager.transaction(async (tx) => {
      const locked = await tx.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!locked || locked.attendance === 'no_show') return payment;
      await releaseToExtra(tx, payment.session.groupId, [payment]);
      payment.status = PaymentStatus.WAIVED;
      payment.attendance = 'no_show';
      payment.paidAt = null;
      payment.source = null;
      if (markedBy) payment.markedBy = markedBy;
      return tx.save(payment);
    });
    await this.recalculateSessionTotal(payment.sessionId);
    return saved;
  }

  /** They came after all: back to owing for the game (or as they were, if already settled). */
  async markCame(id: string, organizationId: string) {
    const payment = await this.ownedPayment(id, organizationId);
    if (payment.attendance === 'no_show') {
      // Back to what they'd owe for the game; in dues groups the game itself costs nothing.
      payment.status = payment.source === 'dues' || Number(payment.amount) === 0 ? PaymentStatus.WAIVED : PaymentStatus.PENDING;
      payment.markedBy = null;
    }
    payment.attendance = 'came';
    const saved = await this.paymentsRepo.save(payment);
    await this.recalculateSessionTotal(payment.sessionId);
    return saved;
  }

  /**
   * Money that came by transfer pays the player's oldest unpaid game first, but they may have
   * meant another (paid for this Saturday, still owe last week). Moves it: `toId`, another of
   * their unpaid games in the same group, becomes paid by that transfer, and this one goes back
   * to unpaid. If the other game costs less, the difference is kept for their next game; if it
   * costs more, it can't move (they'd have to pay the rest first).
   */
  async moveToGame(id: string, toId: string, organizationId: string) {
    const from = await this.ownedPayment(id, organizationId);
    if (!paidByTransfer(from)) throw new BadRequestException('Only a payment that came by transfer can be moved to another game');
    const to = await this.ownedPayment(toId, organizationId);
    if (to.id === from.id || to.playerId !== from.playerId || to.session.groupId !== from.session.groupId) {
      throw new BadRequestException("That game isn't one of this player's in this group");
    }
    if (to.status !== PaymentStatus.PENDING || to.session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('That game is already paid or was called off');
    }
    const extra = Number(from.amount) - Number(to.amount);
    if (extra < 0) {
      throw new BadRequestException(`This payment is ${naira(from.amount)}, less than the ${naira(to.amount)} that game costs`);
    }

    await this.paymentsRepo.manager.transaction(async (tx) => {
      // Both only if nothing changed under us: still paid by transfer, still unpaid.
      const moved = await tx.update(Payment, { id: from.id, status: PaymentStatus.PAID }, {
        status: PaymentStatus.PENDING,
        paidAt: null as unknown as Date,
        source: null as unknown as string,
        markedBy: null as unknown as string,
      });
      const paid = await tx.update(Payment, { id: to.id, status: PaymentStatus.PENDING }, {
        status: PaymentStatus.PAID,
        paidAt: from.paidAt ?? new Date(),
        source: 'transfer',
        markedBy: from.markedBy,
      });
      if (!moved.affected || !paid.affected) throw new BadRequestException('Someone else just changed one of these payments. Try again.');
      // The transfer now pays the other game.
      await tx.update(BankTransfer, { paymentId: from.id }, { paymentId: to.id });
      // The rest of that transfer waits as extra to sort, like any money more than a game.
      if (extra > 0) {
        const membership = await tx.findOne(GroupMembership, {
          where: { groupId: from.session.groupId, playerId: from.playerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (membership) {
          membership.extra = (Number(membership.extra ?? 0) + extra).toFixed(2);
          await tx.save(membership);
        }
      }
    });

    await this.recalculateSessionTotal(from.sessionId);
    await this.recalculateSessionTotal(to.sessionId);
    return { from: from.id, to: to.id, kept: extra };
  }

  private async ownedPayment(id: string, organizationId: string) {
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async bulkMarkAsPaid(paymentIds: string[], organizationId: string, markedBy?: string, source?: 'cash' | 'manual') {
    const payments: Payment[] = [];
    const sessionIds = new Set<string>();

    for (const id of paymentIds) {
      const payment = await this.paymentsRepo
        .createQueryBuilder('payment')
        .innerJoinAndSelect('payment.session', 'session')
        .innerJoin('session.group', 'group')
        .where('payment.id = :id', { id })
        .andWhere('group.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!payment) throw new NotFoundException(`Payment ${id} not found`);
      if (payment.status === PaymentStatus.PAID) continue;
      payments.push(payment);
      sessionIds.add(payment.sessionId);
    }

    // Lock each row inside the transaction and re-check status to prevent double credit consumption.
    const saved = await this.paymentsRepo.manager.transaction(async (tx) => {
      const out: Payment[] = [];
      for (const payment of payments) {
        const locked = await tx.findOne(Payment, { where: { id: payment.id }, lock: { mode: 'pessimistic_write' } });
        if (!locked || locked.status === PaymentStatus.PAID) continue;
        await usePartPaid(tx, payment, payment.session.groupId);
        payment.status = PaymentStatus.PAID;
        payment.paidAt = new Date();
        payment.source = source ?? 'manual';
        if (markedBy) payment.markedBy = markedBy;
        out.push(await tx.save(payment));
      }
      return out;
    });

    for (const sessionId of sessionIds) {
      await this.recalculateSessionTotal(sessionId);
    }
    this.notifications.later(() => this.sendReceipts(saved.map((p) => p.id), 'manual'));

    return saved;
  }

  /**
   * Bulk-waive every pending payment for the given sessions. Used by super-admins
   * when an organiser confirms nobody owes anything for upcoming games.
   */
  async waiveBySession(sessionIds: string[]): Promise<{ waived: number; sessionIds: string[] }> {
    if (!sessionIds.length) return { waived: 0, sessionIds: [] };
    const pending = await this.paymentsRepo.find({
      where: { sessionId: In(sessionIds), status: PaymentStatus.PENDING },
      relations: ['session'],
    });
    if (!pending.length) return { waived: 0, sessionIds };

    for (const payment of pending) {
      await releaseToExtra(this.paymentsRepo.manager, payment.session.groupId, [payment]);
      payment.status = PaymentStatus.WAIVED;
      payment.attendance = 'came';
    }
    await this.paymentsRepo.save(pending);

    const affected = [...new Set(pending.map((p) => p.sessionId))];
    for (const sid of affected) {
      await this.recalculateSessionTotal(sid);
    }
    return { waived: pending.length, sessionIds: affected };
  }

  async recalculateSessionTotal(sessionId: string) {
    const payments = await this.paymentsRepo.find({
      where: { sessionId, status: PaymentStatus.PAID },
    });
    const total = Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100) / 100;
    await this.sessionsRepo.update(sessionId, { collectedAmount: total });
  }
}
