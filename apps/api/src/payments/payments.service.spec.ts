import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Session } from '../sessions/entities/session.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepo: Record<string, jest.Mock>;
  let sessionsRepo: Record<string, jest.Mock>;

  const mockPayment = {
    session: { groupId: 'group-1' },
    id: 'pay-1',
    sessionId: 'session-1',
    playerId: 'player-1',
    amount: 1000,
    status: PaymentStatus.PENDING,
    paidAt: null,
    markedBy: null,
    createdAt: new Date(),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    paymentsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
    };
    // Mark paid runs in a transaction: no membership here, so nothing is part paid.
    (paymentsRepo as any).manager = {
      transaction: (fn: (tx: unknown) => unknown) => fn({
        findOne: async (entity: any) => entity === Payment ? { status: PaymentStatus.PENDING } : null,
        save: (x: unknown) => paymentsRepo.save(x),
      }),
    };
    sessionsRepo = {
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: getRepositoryToken(Session), useValue: sessionsRepo },
        { provide: NotificationsService, useValue: { later: jest.fn(), notifyPlayers: jest.fn(), notifyOrganisers: jest.fn() } },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('markAsPaid', () => {
    it('should update status, set paidAt, and recalculate session', async () => {
      const payment = { ...mockPayment };
      const qb = { ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(payment) };
      paymentsRepo.createQueryBuilder.mockReturnValue(qb);
      paymentsRepo.save.mockResolvedValue({ ...payment, status: PaymentStatus.PAID });
      paymentsRepo.find.mockResolvedValue([{ amount: 1000, status: PaymentStatus.PAID }]);

      const result = await service.markAsPaid('pay-1', 'org-1', 'admin-1');

      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(payment.paidAt).toBeDefined();
      expect(payment.markedBy).toBe('admin-1');
      expect(paymentsRepo.save).toHaveBeenCalled();
      expect(sessionsRepo.update).toHaveBeenCalledWith('session-1', { collectedAmount: 1000 });
    });

    it('should throw NotFoundException if payment not found', async () => {
      const qb = { ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(null) };
      paymentsRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.markAsPaid('bad-id', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('waive', () => {
    it('should set status to WAIVED and recalculate session', async () => {
      const payment = { ...mockPayment, session: { groupId: 'group-1' } };
      const qb = { ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(payment) };
      paymentsRepo.createQueryBuilder.mockReturnValue(qb);
      paymentsRepo.save.mockResolvedValue({ ...payment, status: PaymentStatus.WAIVED });
      paymentsRepo.find.mockResolvedValue([]);

      await service.waive('pay-1', 'org-1', 'admin-1');

      expect(payment.status).toBe(PaymentStatus.WAIVED);
      expect(payment.markedBy).toBe('admin-1');
      expect(sessionsRepo.update).toHaveBeenCalledWith('session-1', { collectedAmount: 0 });
    });

    it('moves a due already paid by transfer to the member\'s extra to sort', async () => {
      const payment = { ...mockPayment, status: PaymentStatus.PAID, source: 'transfer', session: { groupId: 'group-1' } };
      const membership = { groupId: 'group-1', playerId: 'player-1', credit: '0.00' };
      const innerTx = { findOne: jest.fn().mockResolvedValue(membership), save: jest.fn() };
      const tx = { findOne: jest.fn().mockResolvedValue(membership), save: jest.fn(), transaction: (fn: any) => fn(innerTx) };
      (paymentsRepo as any).manager = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
      paymentsRepo.createQueryBuilder.mockReturnValue({ ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(payment) });
      paymentsRepo.find.mockResolvedValue([]);

      await service.waive('pay-1', 'org-1', 'admin-1');

      expect(membership).toMatchObject({ credit: '0.00', extra: '1000.00' });
      expect(payment.status).toBe(PaymentStatus.WAIVED);
    });
  });

  describe('attendance', () => {
    const transferPaid = () => {
      const payment: any = { ...mockPayment, status: PaymentStatus.PAID, source: 'transfer', session: { groupId: 'group-1' } };
      const membership = { groupId: 'group-1', playerId: 'player-1', credit: '0.00' };
      const innerTx = { findOne: jest.fn().mockResolvedValue(membership), save: jest.fn() };
      const tx = { findOne: jest.fn().mockResolvedValue(membership), save: jest.fn(), transaction: (fn: any) => fn(innerTx) };
      (paymentsRepo as any).manager = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
      paymentsRepo.createQueryBuilder.mockReturnValue({ ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(payment) });
      paymentsRepo.save.mockImplementation(async (x) => x);
      paymentsRepo.find.mockResolvedValue([]);
      return { payment, membership };
    };

    it("didn't come: nothing to pay, and transfer money waits as extra to sort", async () => {
      const { payment, membership } = transferPaid();
      await service.markNoShow('pay-1', 'org-1', 'Tunde B');
      expect(payment).toMatchObject({ status: PaymentStatus.WAIVED, attendance: 'no_show', source: null });
      expect(membership).toMatchObject({ credit: '0.00', extra: '1000.00' });
    });

    it('came after all: back to owing', async () => {
      const payment: any = { ...mockPayment, status: PaymentStatus.WAIVED, attendance: 'no_show', session: { groupId: 'group-1' } };
      paymentsRepo.createQueryBuilder.mockReturnValue({ ...mockQueryBuilder, getOne: jest.fn().mockResolvedValue(payment) });
      paymentsRepo.save.mockImplementation(async (x) => x);
      paymentsRepo.find.mockResolvedValue([]);
      await service.markCame('pay-1', 'org-1');
      expect(payment).toMatchObject({ status: PaymentStatus.PENDING, attendance: 'came' });
    });

    it('undoing a transfer payment puts the money in extra to sort, not on another game', async () => {
      const { payment, membership } = transferPaid();
      await service.markAsUnpaid('pay-1', 'org-1');
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(membership).toMatchObject({ credit: '0.00', extra: '1000.00' });
    });
  });

  describe('bulkMarkAsPaid', () => {
    it('should mark multiple payments and recalculate affected sessions', async () => {
      const payment1 = { ...mockPayment, id: 'pay-1', sessionId: 'session-1' };
      const payment2 = { ...mockPayment, id: 'pay-2', sessionId: 'session-2' };

      let callCount = 0;
      paymentsRepo.createQueryBuilder.mockImplementation(() => ({
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue(callCount++ === 0 ? payment1 : payment2),
      }));
      paymentsRepo.save.mockResolvedValue([payment1, payment2]);
      paymentsRepo.find.mockResolvedValue([{ amount: 1000, status: PaymentStatus.PAID }]);

      await service.bulkMarkAsPaid(['pay-1', 'pay-2'], 'org-1', 'admin-1');

      expect(paymentsRepo.save).toHaveBeenCalled();
      // Should recalculate both sessions
      expect(sessionsRepo.update).toHaveBeenCalledTimes(2);
    });
  });
});
