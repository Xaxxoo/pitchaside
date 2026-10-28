import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { Player } from '../players/entities/player.entity';
import { User } from '../users/entities/user.entity';
import { OutboundMessage } from './entities/outbound-message.entity';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { NotificationsService, Notice } from './notifications.service';
import { MockMessagingProvider } from './providers/messaging.provider';

const withEmail = {
  id: 'p1',
  firstName: 'Emeka',
  lastName: 'Nwosu',
  phone: '08031234567',
  email: 'emeka@example.com',
  organizationId: 'org1',
  organization: { name: 'Lekki Ballers' },
} as Player;
const withoutEmail = { ...withEmail, id: 'p2', firstName: 'Bisi', phone: '08039876543', email: null } as unknown as Player;

const notice: Notice = { kind: 'payment_reminder', title: '₦3,000 for last night', body: 'Your reference is PA7K2Q.', url: '/me/pay' };

/** No push subscriptions exist, so every notice needs the fallback. */
function setup(fallback: string, mailMode: 'live' | 'mock' = 'live') {
  const saved: Partial<OutboundMessage>[] = [];
  const messagesRepo = {
    create: (row: Partial<OutboundMessage>) => row,
    save: async (row: Partial<OutboundMessage>) => {
      saved.push(row);
      return row;
    },
  } as unknown as Repository<OutboundMessage>;
  const mail = { mode: mailMode, sendNotice: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(
    messagesRepo,
    { find: async () => [] } as unknown as Repository<PushSubscriptionEntity>,
    { find: async () => [withEmail, withoutEmail] } as unknown as Repository<Player>,
    {} as Repository<User>,
    new MockMessagingProvider(),
    { get: (key: string, fallbackValue?: unknown) => (key === 'NOTIFY_FALLBACK' ? (fallback ?? fallbackValue) : fallbackValue) } as unknown as ConfigService,
    mail as unknown as MailService,
  );
  return { service, mail, saved, emails: () => saved.filter((m) => m.channel === 'email') };
}

describe('NotificationsService email fallback', () => {
  it('emails players push could not reach, and only those with an address', async () => {
    const { service, mail, emails } = setup('email');
    await service.notifyPlayers(['p1', 'p2'], notice);

    expect(mail.sendNotice).toHaveBeenCalledTimes(1);
    expect(mail.sendNotice).toHaveBeenCalledWith('emeka@example.com', {
      name: 'Emeka',
      clubName: 'Lekki Ballers',
      kind: 'payment_reminder',
      title: notice.title,
      body: notice.body,
      path: '/me/pay',
    });
    expect(emails()).toEqual([expect.objectContaining({ to: 'emeka@example.com', status: 'sent', playerId: 'p1', organizationId: 'org1' })]);
  });

  it('sends no email when the fallback is off', async () => {
    const { service, mail, saved } = setup('none');
    await service.notifyPlayers(['p1', 'p2'], notice);

    expect(mail.sendNotice).not.toHaveBeenCalled();
    expect(saved.map((m) => m.channel)).toEqual(['push', 'push']);
  });

  it('records a failed send instead of throwing', async () => {
    const { service, mail, emails } = setup('email');
    mail.sendNotice.mockRejectedValue(new Error('550 relay denied'));

    await expect(service.notifyPlayers(['p1'], notice)).resolves.toEqual({ delivered: 0, missed: 2 });
    expect(emails()[0]).toEqual(expect.objectContaining({ status: 'failed', error: '550 relay denied' }));
  });

  it('marks emails as test mode when SMTP is not configured', async () => {
    const { service, emails } = setup('email', 'mock');
    await service.notifyPlayers(['p1'], notice);
    expect(emails()[0].status).toBe('mock');
  });
});

describe('Notifications on by default', () => {
  it('with nothing set on the server, people a notification can’t reach get an email', async () => {
    const { service, mail } = setup(undefined as unknown as string);
    expect(service.fallback).toBe('email');
    await service.notifyPlayers(['p1'], notice);
    expect(mail.sendNotice).toHaveBeenCalledTimes(1);
  });

  it('a player who switched emails off gets none', async () => {
    const off = { ...withEmail, emailNotices: false } as Player;
    const { service, mail, saved } = setup('email');
    (service as any).playersRepo = { find: async () => [off] };
    await service.notifyPlayers(['p1'], notice);
    expect(mail.sendNotice).not.toHaveBeenCalled();
    expect(saved.map((m) => m.channel)).toEqual(['push']);
  });

  it('organisers: email only when no device got it, and not when they switched emails off', async () => {
    const { service, mail } = setup('email');
    (service as any).usersRepo = {
      find: async () => [
        { id: 'u1', email: 'tunde@example.com', firstName: 'Tunde', emailNotices: true },
        { id: 'u2', email: 'co@example.com', firstName: 'Co', emailNotices: false },
      ],
    };
    await service.notifyOrganisers('org1', { kind: 'share_invite', title: 'Send Saturday’s link', body: 'x', url: '/sessions/s' }, { email: true });
    expect(mail.sendNotice).toHaveBeenCalledTimes(1);
    expect(mail.sendNotice.mock.calls[0][0]).toBe('tunde@example.com');
  });

  it('organiser notices that aren’t meant for email stay push-only', async () => {
    const { service, mail } = setup('email');
    (service as any).usersRepo = { find: async () => [{ id: 'u1', email: 'tunde@example.com', firstName: 'Tunde' }] };
    await service.notifyOrganisers('org1', { kind: 'payment_received', title: 'x', body: 'y' });
    expect(mail.sendNotice).not.toHaveBeenCalled();
  });
});

describe('NotificationsService WhatsApp fallback', () => {
  it('sends a player with no email (who cannot sign in) the club link to join, and others the page', async () => {
    const { service, saved } = setup('whatsapp');
    (withoutEmail as any).organization = { name: 'Lekki Ballers', inviteCode: 'club123' };
    try {
      await service.notifyPlayers(['p1', 'p2'], notice);
    } finally {
      (withoutEmail as any).organization = { name: 'Lekki Ballers' };
    }
    const sent = saved.filter((m) => m.channel !== 'push' && m.channel !== 'email');
    const bisi = sent.find((m) => m.to?.includes('9876543'));
    const emeka = sent.find((m) => m.to?.includes('1234567'));
    expect(bisi?.body).toContain('Join to see it: ');
    expect(bisi?.body).toContain('/join/club123');
    expect(emeka?.body).toContain('/me/pay');
    expect(emeka?.body).not.toContain('/join/');
  });
});
