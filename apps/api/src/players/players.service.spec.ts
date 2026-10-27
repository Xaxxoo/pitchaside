import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlayersService } from './players.service';
import { Player } from './entities/player.entity';
import { Payment } from '../payments/entities/payment.entity';

describe('PlayersService', () => {
  let service: PlayersService;
  let playersRepo: Record<string, jest.Mock>;
  let paymentsRepo: { createQueryBuilder: jest.Mock; manager: { find: jest.Mock } };

  const mockPlayer = {
    id: 'player-1',
    firstName: 'John',
    lastName: 'Doe',
    phone: '08012345678',
    email: 'john@test.com',
    organizationId: 'org-1',
    memberships: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    playersRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entity) => Promise.resolve({ ...mockPlayer, ...entity })),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };
    paymentsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
      manager: { find: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: getRepositoryToken(Player), useValue: playersRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
      ],
    }).compile();

    service = module.get<PlayersService>(PlayersService);
  });

  describe('create', () => {
    it('says who already has the number instead of a server error', async () => {
      playersRepo.findOne.mockResolvedValue({ ...mockPlayer, id: 'player-2', firstName: 'Ada', lastName: 'Obi' });
      await expect(service.create({ firstName: 'New', lastName: 'Guy', phone: '08012345678' }, 'org-1')).rejects.toThrow(
        'Ada Obi already has this number',
      );
      expect(playersRepo.save).not.toHaveBeenCalled();
    });

    it('two saves at once: the second gets the same plain answer', async () => {
      playersRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockPlayer, id: 'player-2', firstName: 'Ada', lastName: 'Obi' });
      playersRepo.save.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { constraint: 'UQ_players_org_phone' }));
      await expect(service.create({ firstName: 'New', lastName: 'Guy', phone: '08012345678' }, 'org-1')).rejects.toThrow('Ada Obi already has this number');
    });

    it('should create player with organization association', async () => {
      const dto = { firstName: 'John', lastName: 'Doe', phone: '08012345678' };
      playersRepo.create.mockReturnValue({ ...dto, organizationId: 'org-1' });
      playersRepo.save.mockResolvedValue({ ...mockPlayer });

      const result = await service.create(dto as any, 'org-1');

      expect(playersRepo.create).toHaveBeenCalledWith({
        ...dto,
        nickname: null,
        organizationId: 'org-1',
      });
      expect(result.organizationId).toBe('org-1');
      expect(result.firstName).toBe('John');
    });
  });

  describe('getStats', () => {
    it('should calculate correct totals and payment rate', async () => {
      playersRepo.findOne.mockResolvedValue(mockPlayer);

      const payments = [
        { id: 'p1', status: 'paid', amount: 1000 },
        { id: 'p2', status: 'paid', amount: 1000 },
        { id: 'p3', status: 'pending', amount: 1000 },
        { id: 'p4', status: 'paid', amount: 500 },
        { id: 'p5', status: 'pending', amount: 500 },
      ];
      // What's owed, as the second query returns it: a played game, then their next game.
      const pending = [
        { id: 'p3', amount: '1000.00', session: { date: '2026-01-03', groupId: 'g1' } },
        { id: 'p5', amount: '500.00', session: { date: '2099-01-03', groupId: 'g1' } },
      ];
      paymentsRepo.createQueryBuilder
        .mockReturnValueOnce({ ...mockQueryBuilder, getMany: jest.fn().mockResolvedValue(payments) })
        .mockReturnValueOnce({ ...mockQueryBuilder, getMany: jest.fn().mockResolvedValue(pending) });
      // ₦200 already sent towards the oldest game.
      paymentsRepo.manager.find.mockResolvedValue([{ groupId: 'g1', credit: '200.00' }]);

      const result = await service.getStats('player-1', 'org-1');

      expect(result.totalSessions).toBe(5);
      expect(result.totalPaid).toBe(2500); // 1000+1000+500
      expect(result.totalOwed).toBe(1300); // 1000+500, less the ₦200 part payment
      expect(result.paymentRate).toBe(60); // 3/5 = 60%
    });

    it('leaves games further ahead than the next one out of what is owed now', async () => {
      playersRepo.findOne.mockResolvedValue(mockPlayer);
      const pending = [
        { id: 'a', amount: '1500.00', session: { date: '2099-01-03', groupId: 'g1' } },
        { id: 'b', amount: '1500.00', session: { date: '2099-01-10', groupId: 'g1' } },
      ];
      paymentsRepo.createQueryBuilder
        .mockReturnValueOnce({ ...mockQueryBuilder, getMany: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ ...mockQueryBuilder, getMany: jest.fn().mockResolvedValue(pending) });

      expect((await service.getStats('player-1', 'org-1')).totalOwed).toBe(1500);
    });

    it('should return zeros when player has no payments', async () => {
      playersRepo.findOne.mockResolvedValue(mockPlayer);

      const qb = {
        ...mockQueryBuilder,
        getMany: jest.fn().mockResolvedValue([]),
      };
      paymentsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getStats('player-1', 'org-1');

      expect(result.totalSessions).toBe(0);
      expect(result.totalPaid).toBe(0);
      expect(result.totalOwed).toBe(0);
      expect(result.paymentRate).toBe(0);
    });
  });
});
