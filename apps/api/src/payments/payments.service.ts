import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Session } from '../sessions/entities/session.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { naira, shortDate } from '../common/format.util';
import { refundToCredit } from './credit';

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
      const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
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
    if (!session) throw new NotFoundException('Session not found');

    const payment = this.paymentsRepo.create(dto);
    if (dto.status === PaymentStatus.PAID) {
      payment.paidAt = new Date();
    }
    const saved = await this.paymentsRepo.save(payment);

    await this.recalculateSessionTotal(dto.sessionId);
    return saved;
  }

  async markAsPaid(id: string, organizationId: string, markedBy?: string) {
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    // Already paid (perhaps by transfer): keep when and how, and don't send a second receipt.
    if (payment.status === PaymentStatus.PAID) return payment;

    payment.status = PaymentStatus.PAID;
    payment.paidAt = new Date();
    payment.source = 'manual';
    if (markedBy) payment.markedBy = markedBy;
    const saved = await this.paymentsRepo.save(payment);

    await this.recalculateSessionTotal(payment.sessionId);
    this.notifications.later(() => this.sendReceipts([saved.id], 'manual'));
    return saved;
  }

  async markAsUnpaid(id: string, organizationId: string) {
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PENDING) return payment;

    payment.status = PaymentStatus.PENDING;
    payment.paidAt = null as any;
    payment.source = null as any;
    payment.markedBy = null as any;
    const saved = await this.paymentsRepo.save(payment);

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

    // Waiving a due they'd already paid by transfer: the money goes to their credit (and on to
    // their next due within the hour) instead of vanishing from the books.
    await refundToCredit(this.paymentsRepo.manager, payment.session.groupId, [payment]);
    payment.status = PaymentStatus.WAIVED;
    if (waivedBy) payment.markedBy = waivedBy;
    const saved = await this.paymentsRepo.save(payment);

    await this.recalculateSessionTotal(payment.sessionId);
    return saved;
  }

  async bulkMarkAsPaid(paymentIds: string[], organizationId: string, markedBy?: string) {
    const payments: Payment[] = [];
    const sessionIds = new Set<string>();

    for (const id of paymentIds) {
      const payment = await this.paymentsRepo
        .createQueryBuilder('payment')
        .innerJoin('payment.session', 'session')
        .innerJoin('session.group', 'group')
        .where('payment.id = :id', { id })
        .andWhere('group.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!payment) throw new NotFoundException(`Payment ${id} not found`);
      if (payment.status === PaymentStatus.PAID) continue;

      payment.status = PaymentStatus.PAID;
      payment.paidAt = new Date();
      payment.source = 'manual';
      if (markedBy) payment.markedBy = markedBy;
      payments.push(payment);
      sessionIds.add(payment.sessionId);
    }

    const saved = await this.paymentsRepo.save(payments);

    for (const sessionId of sessionIds) {
      await this.recalculateSessionTotal(sessionId);
    }
    this.notifications.later(() => this.sendReceipts(saved.map((p) => p.id), 'manual'));

    return saved;
  }

  async recalculateSessionTotal(sessionId: string) {
    const payments = await this.paymentsRepo.find({
      where: { sessionId, status: PaymentStatus.PAID },
    });
    const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    await this.sessionsRepo.update(sessionId, { collectedAmount: total });
  }
}
