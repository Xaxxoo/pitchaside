import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionsService } from './sessions.service';
import { Session, SessionStatus } from './entities/session.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { MailService } from '../mail/mail.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { RatingsService } from '../ratings/ratings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { PaymentsService } from '../payments/payments.service';
import { RecurrenceType } from './dto/create-session.dto';
import { ReminderLog } from '../reminders/entities/reminder-log.entity';

describe('SessionsService', () => {
  let paymentsService: { markNoShow: jest.Mock };
  let service: SessionsService;
  let sessionsRepo: Record<string, jest.Mock>;
  let groupsRepo: Record<string, jest.Mock>;
  let membershipsRepo: Record<string, jest.Mock>;
  let paymentsRepo: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;
  let logRepo: { findOne: jest.Mock; insert: jest.Mock };
  let ratings: { ensureVotingToken: jest.Mock; isVoteOpen: jest.Mock; votersOf: jest.Mock };

  const mockGroup = {
    id: 'group-1',
    name: 'Monday Football',
    organizationId: 'org-1',
    targetPlayers: 10,
    feePerPlayer: 500,
  };

  const mockMemberships = [
    { id: 'mem-1', groupId: 'group-1', playerId: 'player-1' },
    { id: 'mem-2', groupId: 'group-1', playerId: 'player-2' },
  ];

  const mockSession = {
    id: 'session-1',
    groupId: 'group-1',
    date: '2027-06-15',
    targetAmount: 5000,
    collectedAmount: 0,
    status: SessionStatus.UPCOMING,
    group: mockGroup,
    payments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };

  const notificationsService = {
    later: jest.fn(),
    notifyPlayers: jest.fn().mockResolvedValue({ delivered: 3, missed: 0 }),
  };

  beforeEach(async () => {
    sessionsRepo = {
      create: jest.fn((data) => ({ ...data, id: 'session-new' })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id || 'session-new' })),
      createQueryBuilder: jest.fn().mockReturnValue({ ...mockQueryBuilder }),
    };
    // Part payments: no one has kept money in these tests.
    const none: any = { where: () => none, andWhere: () => none, getMany: async () => [] };
    (sessionsRepo as any).manager = { getRepository: () => ({ createQueryBuilder: () => none }) };
    groupsRepo = { findOne: jest.fn() };
    membershipsRepo = { find: jest.fn() };
    paymentsRepo = {
      create: jest.fn((data) => data),
      save: jest.fn((entities) => Promise.resolve(entities)),
    };
    mailService = {
      sendPaymentReminder: jest.fn().mockResolvedValue(undefined),
    };

    paymentsService = { markNoShow: jest.fn() };
    logRepo = { findOne: jest.fn().mockResolvedValue(null), insert: jest.fn() };
    ratings = { ensureVotingToken: jest.fn().mockResolvedValue('tok'), isVoteOpen: jest.fn().mockReturnValue(true), votersOf: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getRepositoryToken(Session), useValue: sessionsRepo },
        { provide: getRepositoryToken(Group), useValue: groupsRepo },
        { provide: getRepositoryToken(GroupMembership), useValue: membershipsRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepo },
        { provide: MailService, useValue: mailService },
        { provide: RsvpService, useValue: { announceGame: jest.fn() } },
        { provide: RatingsService, useValue: ratings },
        { provide: getRepositoryToken(ReminderLog), useValue: logRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: BillingService, useValue: { applyCredits: jest.fn() } },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  describe('update (move a game)', () => {
    const ahead = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const game = (over: Record<string, unknown> = {}) => ({
      ...mockSession,
      date: ahead,
      kickoffTime: null,
      group: { ...mockGroup, kickoffTime: '20:00' },
      payments: [{ id: 'pay-1', playerId: 'player-1' }, { id: 'pay-2', playerId: 'player-2', attendance: 'no_show' }],
      ...over,
    });
    let scores: number;
    beforeEach(() => {
      scores = 0;
      sessionsRepo.update = jest.fn();
      (sessionsRepo as any).manager.count = jest.fn(async () => scores);
      (logRepo as any).delete = jest.fn();
      notificationsService.later.mockClear();
    });
    // The notification mocks are shared with the tests below: leave them clean.
    afterEach(() => {
      notificationsService.later.mockClear();
      notificationsService.notifyPlayers.mockClear();
    });

    it('moves the day and time, lets the reminders go again and tells the players in it', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(game() as any);
      const later = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
      await service.update('session-1', { date: later, kickoffTime: '19:30' }, 'org-1');
      expect(sessionsRepo.update).toHaveBeenCalledWith('session-1', { date: later, kickoffTime: '19:30' });
      expect((logRepo as any).delete).toHaveBeenCalled();
      expect(notificationsService.later).toHaveBeenCalledTimes(1);
      await notificationsService.later.mock.calls[0][0]();
      // Only the player who's in, not the no-show.
      expect(notificationsService.notifyPlayers).toHaveBeenLastCalledWith(['player-1'], expect.objectContaining({ title: 'Game moved: Monday Football ⚽' }));
    });

    it('an empty time goes back to the group kick-off', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(game({ kickoffTime: '18:00' }) as any);
      await service.update('session-1', { kickoffTime: '' }, 'org-1');
      expect(sessionsRepo.update).toHaveBeenCalledWith('session-1', { date: ahead, kickoffTime: null });
    });

    it('does nothing when nothing changes', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(game() as any);
      await service.update('session-1', { date: ahead }, 'org-1');
      expect(sessionsRepo.update).not.toHaveBeenCalled();
    });

    it('refuses an ended, called-off or scored game, and a day in the past', async () => {
      const spy = jest.spyOn(service, 'findOne');
      spy.mockResolvedValue(game({ status: SessionStatus.COMPLETED }) as any);
      await expect(service.update('session-1', { kickoffTime: '19:00' }, 'org-1')).rejects.toThrow('ended');
      spy.mockResolvedValue(game({ status: SessionStatus.CANCELLED }) as any);
      await expect(service.update('session-1', { kickoffTime: '19:00' }, 'org-1')).rejects.toThrow('called off');
      spy.mockResolvedValue(game() as any);
      scores = 1;
      await expect(service.update('session-1', { kickoffTime: '19:00' }, 'org-1')).rejects.toThrow('Scores');
      scores = 0;
      await expect(service.update('session-1', { date: '2020-01-01' }, 'org-1')).rejects.toThrow('today or a day ahead');
      expect(sessionsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a session with payments for each group member', async () => {
      groupsRepo.findOne.mockResolvedValue(mockGroup);
      membershipsRepo.find.mockResolvedValue(mockMemberships);
      // findOne is called at the end — mock the query builder
      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue(mockSession),
      };
      sessionsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.create(
        { groupId: 'group-1', date: '2027-06-15' },
        'org-1',
      );

      expect(sessionsRepo.create).toHaveBeenCalled();
      expect(sessionsRepo.save).toHaveBeenCalled();
      // Should create one payment per member
      expect(paymentsRepo.create).toHaveBeenCalledTimes(2);
      expect(paymentsRepo.save).toHaveBeenCalled();
    });

    it('should generate correct number of sessions for recurring', async () => {
      groupsRepo.findOne.mockResolvedValue(mockGroup);
      membershipsRepo.find.mockResolvedValue([]);
      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue(mockSession),
      };
      sessionsRepo.createQueryBuilder.mockReturnValue(qb);

      await service.create(
        {
          groupId: 'group-1',
          date: '2027-06-15',
          recurrenceType: RecurrenceType.WEEKLY,
          recurrenceCount: 4,
        },
        'org-1',
      );

      // Should create 4 sessions (one per week)
      expect(sessionsRepo.create).toHaveBeenCalledTimes(4);
      expect(sessionsRepo.save).toHaveBeenCalledTimes(4);
    });

    it('returns the first game of a series, not the last', async () => {
      groupsRepo.findOne.mockResolvedValue(mockGroup);
      membershipsRepo.find.mockResolvedValue([]);
      sessionsRepo.save.mockImplementation((entity) => Promise.resolve({ ...entity, id: `session-${entity.date}` }));
      const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(mockSession as any);

      await service.create(
        {
          groupId: 'group-1',
          date: '2027-06-15',
          recurrenceType: RecurrenceType.WEEKLY,
          recurrenceCount: 4,
        },
        'org-1',
      );

      expect(findOne).toHaveBeenCalledWith('session-2027-06-15', 'org-1');
    });
  });

  describe('sendReminders', () => {
    it('should push a reminder to every unpaid player', async () => {
      const sessionWithPayments = {
        ...mockSession,
        payments: [
          {
            id: 'p1',
            status: PaymentStatus.PENDING,
            player: { firstName: 'John', email: 'john@test.com' },
            amount: 500,
          },
          {
            id: 'p2',
            status: PaymentStatus.PAID,
            player: { firstName: 'Jane', email: 'jane@test.com' },
            amount: 500,
          },
          {
            id: 'p3',
            status: PaymentStatus.PENDING,
            player: { firstName: 'Bob', email: null },
            amount: 500,
          },
          {
            id: 'p4',
            status: PaymentStatus.PENDING,
            player: { firstName: 'Alice', email: 'alice@test.com' },
            amount: 500,
          },
        ],
      };

      const qb = {
        ...mockQueryBuilder,
        getOne: jest.fn().mockResolvedValue(sessionWithPayments),
      };
      sessionsRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.sendReminders('session-1', 'org-1');

      // John, Bob and Alice are pending (email no longer matters — reminders are push); Jane is paid
      expect(notificationsService.notifyPlayers).toHaveBeenCalledTimes(1);
      expect(notificationsService.notifyPlayers.mock.calls[0][0]).toHaveLength(3);
      expect(result.sent).toBe(3);
    });
  });

  describe('endGame', () => {
    it('marks the players who didn’t come, counts everyone else as came, then completes the game', async () => {
      const game = { ...mockSession, payments: [{ id: 'p1', attendance: null }, { id: 'p2', attendance: null }, { id: 'p3', attendance: 'no_show' }] };
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      const complete = jest.spyOn(service, 'updateStatus').mockResolvedValue(game as any);
      paymentsRepo.update = jest.fn();

      await service.endGame('session-1', ['p2', 'p3'], 'org-1', 'Tunde B');

      expect(paymentsService.markNoShow).toHaveBeenCalledTimes(1);
      expect(paymentsService.markNoShow).toHaveBeenCalledWith('p2', 'org-1', 'Tunde B');
      expect(paymentsRepo.update).toHaveBeenCalledWith('p1', { attendance: 'came' });
      expect(complete).toHaveBeenCalledWith('session-1', 'completed', 'org-1');
    });
  });

  it('sends no reminders for a cancelled game', async () => {
    notificationsService.notifyPlayers.mockClear();
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...mockSession, status: 'cancelled', payments: [{ id: 'p1', status: PaymentStatus.PENDING }] } as any);
    expect(await service.sendReminders('session-1', 'org-1')).toEqual({ sent: 0, missed: 0 });
    expect(notificationsService.notifyPlayers).not.toHaveBeenCalled();
  });

  describe('remindToVote', () => {
    const game = {
      ...mockSession,
      group: { name: 'Ballers' },
      payments: [
        { playerId: 'a', attendance: 'came' },
        { playerId: 'b', attendance: 'came' },
        { playerId: 'c', attendance: 'no_show' },
      ],
    };

    it('nudges only the players who came and haven’t voted', async () => {
      notificationsService.notifyPlayers.mockClear();
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      ratings.votersOf.mockResolvedValue(['a']);
      const r = await service.remindToVote('session-1', 'org-1');
      expect(notificationsService.notifyPlayers).toHaveBeenCalledWith(['b'], expect.objectContaining({ kind: 'vote_nudge', url: '/v/tok' }));
      expect(r.waiting).toBe(1);
      expect(logRepo.insert).toHaveBeenCalled();
    });

    it('waits two hours between reminders', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      logRepo.findOne.mockResolvedValue({ key: 'votenudge-org:session-1:1' });
      await expect(service.remindToVote('session-1', 'org-1')).rejects.toThrow('last two hours');
    });

    it('refuses when the vote isn’t open, and sends nothing when everyone has voted', async () => {
      notificationsService.notifyPlayers.mockClear();
      jest.spyOn(service, 'findOne').mockResolvedValue(game as any);
      ratings.isVoteOpen.mockReturnValueOnce(false);
      await expect(service.remindToVote('session-1', 'org-1')).rejects.toThrow('isn’t open');
      ratings.votersOf.mockResolvedValue(['a', 'b']);
      expect(await service.remindToVote('session-1', 'org-1')).toEqual({ sent: 0, missed: 0, waiting: 0 });
      expect(notificationsService.notifyPlayers).not.toHaveBeenCalled();
    });
  });

  it('refuses a status that isn’t a game status', async () => {
    await expect(service.updateStatus('session-1', 'finished', 'org-1')).rejects.toThrow('Unknown game status');
  });
});
