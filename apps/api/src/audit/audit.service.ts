import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';

/** What the admin feed shows for an entry, resolved from ids when the feed is read. */
export interface AuditSummary {
  actorName: string | null;
  playerName: string | null;
  groupName: string | null;
  sessionDate: string | null;
  amount: number | null;
  count: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async log(data: {
    action: AuditAction;
    entityType: string;
    entityId: string;
    userId: string;
    organizationId: string;
    metadata?: Record<string, any>;
  }) {
    const entry = this.auditRepo.create(data);
    return this.auditRepo.save(entry);
  }

  async findByOrganization(
    organizationId: string,
    query: PaginationDto,
  ): Promise<PaginatedResult<AuditLog & { summary: AuditSummary }>> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const [data, total] = await this.auditRepo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: await this.describe(data, organizationId),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Adds who did it and what it was about, so the feed can say "Tunde marked Tobi Martins
   * paid · Tuesday Night 5-a-side" instead of showing ids. Payment entries keep the payment
   * id(s) in entityId (comma-separated for a bulk mark); the first one names the game.
   */
  private async describe(logs: AuditLog[], organizationId: string) {
    const manager = this.auditRepo.manager;
    const userIds = [...new Set(logs.map((l) => l.userId))];
    const paymentIds = [
      ...new Set(logs.filter((l) => l.entityType === 'payment').map((l) => l.entityId.split(',')[0]).filter(Boolean)),
    ];
    const [users, payments] = await Promise.all([
      userIds.length ? manager.find(User, { where: { id: In(userIds), organizationId } }) : Promise.resolve<User[]>([]),
      paymentIds.length
        ? manager.find(Payment, { where: { id: In(paymentIds) }, relations: ['player', 'session', 'session.group'] })
        : Promise.resolve<Payment[]>([]),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.firstName]));
    // Only payments from this organisation's groups are described.
    const payment = new Map(payments.filter((p) => p.session?.group?.organizationId === organizationId).map((p) => [p.id, p]));

    return logs.map((log) => {
      const ids = log.entityType === 'payment' ? log.entityId.split(',').filter(Boolean) : [];
      const p = ids.length ? payment.get(ids[0]) : undefined;
      const summary: AuditSummary = {
        actorName: userName.get(log.userId) ?? null,
        playerName: ids.length === 1 && p?.player ? `${p.player.firstName} ${p.player.lastName}` : null,
        groupName: p?.session?.group?.name ?? null,
        sessionDate: p?.session?.date ?? null,
        amount: ids.length === 1 && p ? Number(p.amount) : null,
        count: Number(log.metadata?.count ?? ids.length) || 1,
      };
      return Object.assign(log, { summary });
    });
  }
}
