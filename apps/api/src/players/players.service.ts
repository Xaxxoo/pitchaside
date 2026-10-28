import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Player } from './entities/player.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { SessionStatus } from '../sessions/entities/session.entity';
import { owedSplit } from '../payments/credit';
import { localDate } from '../common/time.util';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { CreatePlayerDto, UpdatePlayerDto } from './dto/create-player.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { cleanNickname } from './player-name';

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
  ) {}

  async create(dto: CreatePlayerDto, organizationId: string) {
    await this.phoneFree(dto.phone, organizationId);
    const player = this.playersRepo.create({ ...dto, nickname: cleanNickname(dto.nickname), organizationId });
    return this.saveOrSayWhoHasThePhone(player);
  }

  /**
   * One number, one player in a club. Said plainly with who has it (rather than a server error),
   * so the organiser adds that player instead of making a second one.
   */
  private async phoneFree(phone: string | null | undefined, organizationId: string, self?: string) {
    if (!phone) return;
    const other = await this.playersRepo.findOne({ where: { organizationId, phone } });
    if (other && other.id !== self) {
      throw new ConflictException(`${other.firstName} ${other.lastName} already has this number. Add them from your players instead, or leave the number out.`);
    }
  }

  /** Two saves at once with the same number: the database stops the second, said the same way. */
  private async saveOrSayWhoHasThePhone(player: Player) {
    try {
      return await this.playersRepo.save(player);
    } catch (err) {
      const e = err as { constraint?: string; driverError?: { constraint?: string } };
      if ((e.constraint ?? e.driverError?.constraint) === 'UQ_players_org_phone') {
        await this.phoneFree(player.phone, player.organizationId, player.id);
        throw new ConflictException('Someone in your club already has this number.');
      }
      throw err;
    }
  }

  findAll(organizationId: string) {
    return this.playersRepo.find({ where: { organizationId } });
  }

  async findAllPaginated(
    organizationId: string,
    query: PaginationDto,
  ): Promise<PaginatedResult<Player>> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.playersRepo
      .createQueryBuilder('player')
      .where('player.organizationId = :organizationId', { organizationId });

    if (query.search) {
      qb.andWhere(
        '(player.firstName ILIKE :s OR player.lastName ILIKE :s OR player.nickname ILIKE :s OR player.phone ILIKE :s OR player.email ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    qb.orderBy('player.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId: string) {
    const player = await this.playersRepo.findOne({
      where: { id, organizationId },
      relations: ['memberships', 'memberships.group'],
    });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }

  async update(id: string, dto: UpdatePlayerDto, organizationId: string) {
    const player = await this.findOne(id, organizationId);
    Object.assign(player, dto);
    if (dto.nickname !== undefined) player.nickname = cleanNickname(dto.nickname);
    // A keeper is happy in goal: the day plan's swaps put them there first
    if (dto.position === 'GK' && !dto.keeper) player.keeper = 'happy';
    if (dto.phone) await this.phoneFree(player.phone, organizationId, player.id);
    return this.saveOrSayWhoHasThePhone(player);
  }

  /** Not while they hold credit in a group: it would vanish with them. */
  async remove(id: string, organizationId: string) {
    const player = await this.findOne(id, organizationId);
    const withCredit = await this.playersRepo.manager.count(GroupMembership, {
      where: [
        { playerId: id, credit: MoreThan('0') },
        { playerId: id, extra: MoreThan('0') },
      ],
    });
    if (withCredit) {
      throw new ConflictException('This player has money in a group that hasn’t paid a game yet. Sort it from that group first.');
    }
    await this.playersRepo.remove(player);
  }

  countByOrganization(organizationId: string) {
    return this.playersRepo.count({ where: { organizationId } });
  }

  countAll() {
    return this.playersRepo.count();
  }

  async getStats(playerId: string, organizationId: string) {
    await this.findOne(playerId, organizationId);

    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.playerId = :playerId', { playerId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getMany();

    const totalSessions = payments.length;
    const totalPaid = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    // Owed the same way the player's own Pay tab counts it (owedSplit): what a transfer would pay
    // today, after part payments, leaving out called-off games and ₦0 dues.
    const pending = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.playerId = :playerId', { playerId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .andWhere('payment.status = :pending', { pending: PaymentStatus.PENDING })
      .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .andWhere('payment.amount > 0')
      .orderBy('session.date', 'ASC')
      .getMany();
    const credits = await this.paymentsRepo.manager.find(GroupMembership, { where: { playerId } });
    const today = localDate();
    let totalOwed = 0;
    for (const groupId of new Set(pending.map((p) => p.session.groupId))) {
      const credit = Number(credits.find((m) => m.groupId === groupId)?.credit ?? 0);
      totalOwed += owedSplit(
        pending.filter((p) => p.session.groupId === groupId),
        credit,
        today,
      ).nowTotal;
    }
    const paidCount = payments.filter((p) => p.status === 'paid').length;
    const paymentRate = totalSessions > 0 ? Math.round((paidCount / totalSessions) * 100) : 0;

    return { totalSessions, totalPaid, totalOwed, paymentRate };
  }
}
