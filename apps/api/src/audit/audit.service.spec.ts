import { AuditService } from './audit.service';
import { AuditAction, AuditLog } from './entities/audit-log.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';

/** AuditService over a few logs, one organiser and one payment (and one from another club). */
function setup(logs: Partial<AuditLog>[]) {
  const payments = [
    { id: 'p1', amount: '3000.00', player: { firstName: 'Tobi', lastName: 'Martins' }, session: { date: '2026-10-06', group: { name: 'Tuesday Night 5-a-side', organizationId: 'org1' } } },
    { id: 'pX', amount: '9000.00', player: { firstName: 'Not', lastName: 'Ours' }, session: { date: '2026-10-06', group: { name: 'Other Club', organizationId: 'org2' } } },
  ];
  const manager = {
    find: async (entity: unknown) => (entity === User ? [{ id: 'u1', firstName: 'Tunde' }] : entity === Payment ? payments : []),
  };
  const repo = { manager, findAndCount: async () => [logs, logs.length] };
  return new AuditService(repo as any);
}

const log = (over: Partial<AuditLog>): Partial<AuditLog> => ({ id: 'l', userId: 'u1', entityType: 'payment', organizationId: 'org1', ...over });

describe('activity feed', () => {
  it('names who did it, the player, the amount and the game', async () => {
    const service = setup([log({ action: AuditAction.PAYMENT_MARKED_PAID, entityId: 'p1' })]);
    const { data } = await service.findByOrganization('org1', {});
    expect(data[0].summary).toEqual({
      actorName: 'Tunde', playerName: 'Tobi Martins', groupName: 'Tuesday Night 5-a-side', sessionDate: '2026-10-06', amount: 3000, count: 1,
    });
  });

  it('counts a bulk mark and names its game, without a single player', async () => {
    const service = setup([log({ action: AuditAction.PAYMENT_BULK_MARKED_PAID, entityId: 'p1,p2,p3', metadata: { count: 3 } })]);
    const { data } = await service.findByOrganization('org1', {});
    expect(data[0].summary).toMatchObject({ count: 3, playerName: null, groupName: 'Tuesday Night 5-a-side' });
  });

  it("never describes another club's payment", async () => {
    const service = setup([log({ action: AuditAction.PAYMENT_MARKED_PAID, entityId: 'pX' })]);
    const { data } = await service.findByOrganization('org1', {});
    expect(data[0].summary).toMatchObject({ playerName: null, groupName: null, amount: null });
  });
});
