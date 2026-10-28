import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { Player } from '../players/entities/player.entity';
import { User } from '../users/entities/user.entity';
import { OutboundMessage } from './entities/outbound-message.entity';
import { PushSubscriptionEntity } from './entities/push-subscription.entity';
import { emailKey } from '../common/format.util';
import { MailService } from '../mail/mail.service';
import { Channel, MESSAGING_PROVIDER, MessagingProvider } from './providers/messaging.provider';

export interface Notice {
  /** Push title. */
  title: string;
  /** Push body; also the WhatsApp/SMS text unless `message` is given. */
  body: string;
  /** Path in the web app to open, e.g. "/me". */
  url?: string;
  /** Analytics / outbox label: receipt, dues_open, rsvp_open, vote_open, ... */
  kind: string;
  /** Longer WhatsApp/SMS text (can include account numbers, links). Emails use `body` and a button instead. */
  message?: string;
  /** Always send the fallback (email or WhatsApp/SMS) too, even if the player has push. */
  critical?: boolean;
}

export interface PushInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private pushEnabled = false;

  constructor(
    @InjectRepository(OutboundMessage) private messagesRepo: Repository<OutboundMessage>,
    @InjectRepository(PushSubscriptionEntity) private subsRepo: Repository<PushSubscriptionEntity>,
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @Inject(MESSAGING_PROVIDER) private messaging: MessagingProvider,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (pub && priv) {
      webpush.setVapidDetails(this.config.get('VAPID_SUBJECT', 'mailto:hello@pitchaside.app'), pub, priv);
      this.pushEnabled = true;
    } else {
      this.logger.warn('VAPID keys not set — push notifications disabled');
    }
  }

  get messagingMode() {
    return this.messaging.mode;
  }

  appUrl(path = '') {
    return `${this.config.get('APP_URL', 'http://localhost:3000')}${path}`;
  }

  publicKey() {
    return { publicKey: this.pushEnabled ? this.config.get<string>('VAPID_PUBLIC_KEY') : null };
  }

  // ── WhatsApp / SMS ──

  async sendMessage(input: {
    to: string;
    body: string;
    kind: string;
    channel?: Channel;
    playerId?: string;
    organizationId?: string;
  }) {
    const channel = input.channel ?? (this.config.get<Channel>('MESSAGING_OTP_CHANNEL', 'whatsapp'));
    const record = this.messagesRepo.create({
      organizationId: input.organizationId,
      playerId: input.playerId,
      channel,
      to: input.to,
      kind: input.kind,
      body: input.body,
      provider: this.messaging.name,
      status: this.messaging.mode === 'mock' ? 'mock' : 'sent',
    });
    try {
      await this.messaging.send({ to: input.to, body: input.body, channel });
    } catch (err: any) {
      record.status = 'failed';
      record.error = String(err.message).slice(0, 250);
      this.logger.warn(`Message to ${input.to} failed: ${err.message}`);
    }
    return this.messagesRepo.save(record);
  }

  listMessages(organizationId: string) {
    return this.messagesRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Push ──

  async subscribe(sub: PushInput, owner: { playerId?: string; userId?: string; personKey?: string }) {
    // The server POSTs to this URL on every notification, so it must be a browser's push service,
    // never an address the server can reach inside its own network.
    if (!isPushServiceUrl(sub.endpoint)) throw new BadRequestException("That isn't a browser push address");
    const existing = await this.subsRepo.findOne({ where: { endpoint: sub.endpoint } });
    const row = existing ?? this.subsRepo.create({ endpoint: sub.endpoint });
    row.p256dh = sub.keys.p256dh;
    row.auth = sub.keys.auth;
    row.playerId = owner.playerId ?? (null as unknown as string);
    row.userId = owner.userId ?? (null as unknown as string);
    row.personKey = owner.personKey ?? (null as unknown as string);
    await this.subsRepo.save(row);
    if (!existing) {
      await this.push([row], {
        title: 'Welcome to PitchAside ⚽',
        body: 'Welcome aboard! Keep an eye out for your upcoming games, RSVPs and votes.',
        url: owner.personKey ? '/me' : '/settings',
        kind: 'welcome_push',
      });
    }
    return { subscribed: true };
  }

  /** Turns off push on one device, only if it belongs to whoever is asking. */
  async unsubscribe(endpoint: string, owner: { userId: string } | { personKey: string }) {
    await this.subsRepo.delete({ endpoint, ...owner });
    return { subscribed: false };
  }

  /** Send a test notification only to the current organiser's subscribed devices. */
  async testUser(userId: string) {
    const subs = await this.subsRepo.find({ where: { userId } });
    const delivered = await this.push(subs, {
      title: 'PitchAside test',
      body: 'Push notifications are working on this device.',
      url: '/settings',
      kind: 'test_push',
    });
    return { delivered, missed: Math.max(0, subs.length - delivered) };
  }

  /** Send a test notification to the current player's subscribed devices. */
  async testPerson(owner: { playerId?: string; personKey?: string }) {
    const where = [
      ...(owner.playerId ? [{ playerId: owner.playerId }] : []),
      ...(owner.personKey ? [{ personKey: owner.personKey }] : []),
    ];
    const subs = where.length ? await this.subsRepo.find({ where }) : [];
    const delivered = await this.push(subs, {
      title: 'PitchAside test',
      body: 'Push notifications are working on this device.',
      url: '/me',
      kind: 'test_push',
    });
    return { delivered, missed: Math.max(0, subs.length - delivered) };
  }

  /** Broadcast a promotion to every device that has enabled PitchAside push. */
  async broadcastPush(input: { title: string; body: string; url?: string }) {
    const subs = await this.subsRepo.find();
    const notice = {
      title: input.title,
      body: input.body,
      url: input.url || '/',
      kind: 'promotion',
    } as const;
    const delivered = await this.push(subs, notice);

    await this.messagesRepo.save(
      this.messagesRepo.create({
        organizationId: null as unknown as string,
        playerId: null as unknown as string,
        channel: 'push',
        to: 'All push-enabled devices',
        kind: notice.kind,
        body: `${notice.title}\n${notice.body}`,
        status: delivered > 0 ? 'sent' : 'no_device',
        provider: 'web-push',
      }),
    );

    return { audience: subs.length, delivered, missed: Math.max(0, subs.length - delivered) };
  }

  private async push(subs: PushSubscriptionEntity[], notice: Pick<Notice, 'title' | 'body' | 'url' | 'kind'>) {
    if (!this.pushEnabled || !subs.length) return 0;
    const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url ?? '/', tag: notice.kind });
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        const opts = { TTL: 60 * 60 * 24 };
        try {
          await webpush.sendNotification(sub, payload, opts);
          delivered++;
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await this.subsRepo.delete({ id: s.id });
          } else if (err.statusCode >= 500) {
            // Transient server error: retry once after a short delay.
            try {
              await new Promise((r) => setTimeout(r, 1500));
              await webpush.sendNotification(sub, payload, opts);
              delivered++;
            } catch (retryErr: any) {
              this.logger.warn(`Push retry failed: ${retryErr.statusCode ?? ''} ${retryErr.message}`);
            }
          } else {
            this.logger.warn(`Push failed: ${err.statusCode ?? ''} ${err.message}`);
          }
        }
      }),
    );
    return delivered;
  }

  // ── High level ──

  /**
   * What a player gets when push can't reach them: 'none' = nothing (push only),
   * 'email' = an email if we have their address, 'whatsapp' = WhatsApp/SMS.
   */
  get fallback(): 'none' | 'email' | 'whatsapp' {
    // Email by default: everyone gets told, by notification or else by email, unless they switch it off.
    const mode = this.config.get('NOTIFY_FALLBACK', 'email');
    return mode === 'whatsapp' || mode === 'email' ? mode : 'none';
  }

  /** The notice as an email, logged next to the push so organisers and HQ can see it went. */
  private async emailPlayer(player: Player, notice: Notice) {
    const record = this.messagesRepo.create({
      organizationId: player.organizationId,
      playerId: player.id,
      channel: 'email',
      to: player.email,
      kind: notice.kind,
      body: `${notice.title}\n${notice.body}`,
      provider: 'smtp',
      status: this.mail.mode === 'mock' ? 'mock' : 'sent',
    });
    try {
      await this.mail.sendNotice(player.email, {
        name: player.firstName,
        clubName: player.organization?.name ?? 'your club',
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        path: notice.url,
      });
    } catch (err: any) {
      record.status = 'failed';
      // MailService wraps the provider's reason in a user-facing error; the log keeps the real one.
      record.error = String(err.cause?.message ?? err.message).slice(0, 250);
      this.logger.warn(`Email to ${player.email} failed: ${record.error}`);
    }
    return this.messagesRepo.save(record);
  }

  /**
   * Push to each player's devices (any device signed in with their email).
   * Every notice is logged so organisers can see who actually has push on.
   */
  async notifyPlayers(playerIds: string[], notice: Notice) {
    const ids = [...new Set(playerIds.filter(Boolean))];
    if (!ids.length) return { delivered: 0, missed: 0 };
    const players = await this.playersRepo.find({ where: { id: In(ids) }, relations: ['organization'] });
    const keys = [...new Set(players.filter((p) => p.email).map((p) => emailKey(p.email)))];
    const subs = await this.subsRepo.find({
      where: [{ playerId: In(ids) }, ...(keys.length ? [{ personKey: In(keys) }] : [])],
    });
    let delivered = 0;
    let missed = 0;
    for (const player of players) {
      const key = player.email ? emailKey(player.email) : null;
      const mine = subs.filter((s) => s.playerId === player.id || (key && s.personKey === key));
      const pushed = await this.push(mine, notice);
      if (pushed > 0) delivered++;
      else missed++;
      await this.messagesRepo.save(
        this.messagesRepo.create({
          organizationId: player.organizationId,
          playerId: player.id,
          channel: 'push',
          to: `${player.firstName} ${player.lastName}`,
          kind: notice.kind,
          body: `${notice.title}\n${notice.body}`,
          status: pushed > 0 ? 'sent' : 'no_device',
          provider: 'web-push',
        }),
      );
      const needsFallback = notice.critical || pushed === 0;
      if (this.fallback === 'email' && needsFallback && player.email && player.emailNotices !== false) {
        await this.emailPlayer(player, notice);
      }
      if (this.fallback === 'whatsapp' && needsFallback && player.phone) {
        // Added by hand with no email, they can't sign in: the club's link lets them sign up, and
        // their WhatsApp number finds this record ("Are you Kunle A.?").
        const club = player.organization?.inviteCode;
        const link = !player.email && club ? `\nJoin to see it: ${this.appUrl(`/join/${club}`)}` : notice.url ? `\n${this.appUrl(notice.url)}` : '';
        await this.sendMessage({
          to: player.phone,
          body: notice.message ?? `${notice.title}\n${notice.body}${link}`,
          kind: notice.kind,
          playerId: player.id,
          organizationId: player.organizationId,
        });
      }
    }
    return { delivered, missed };
  }

  /**
   * Push to everyone who runs this organisation (organisers don't get WhatsApp spam). With
   * `email`, an organiser no device reached gets it by email instead, when email is switched on.
   */
  async notifyOrganisers(organizationId: string, notice: Pick<Notice, 'title' | 'body' | 'url' | 'kind'>, opts: { email?: boolean } = {}) {
    const users = await this.usersRepo.find({ where: { organizationId } });
    if (!users.length) return;
    const subs = await this.subsRepo.find({ where: { userId: In(users.map((u) => u.id)) } });
    let pushed = 0;
    for (const user of users) {
      const theirs = subs.filter((s) => s.userId === user.id);
      const sent = await this.push(theirs, notice);
      pushed += sent;
      if (opts.email && sent === 0 && this.fallback === 'email' && user.email && user.emailNotices !== false) {
        const record = this.messagesRepo.create({
          organizationId,
          channel: 'email',
          to: user.email,
          kind: notice.kind,
          body: `${notice.title}\n${notice.body}`,
          provider: 'smtp',
          status: this.mail.mode === 'mock' ? 'mock' : 'sent',
        });
        try {
          await this.mail.sendNotice(user.email, { name: user.firstName, clubName: 'your group', kind: notice.kind, title: notice.title, body: notice.body, path: notice.url });
        } catch (err: any) {
          record.status = 'failed';
          record.error = String(err.cause?.message ?? err.message).slice(0, 250);
          this.logger.warn(`Email to ${user.email} failed: ${record.error}`);
        }
        await this.messagesRepo.save(record);
      }
    }
    await this.messagesRepo.save(
      this.messagesRepo.create({
        organizationId,
        channel: 'push',
        to: 'Organisers',
        kind: notice.kind,
        body: `${notice.title}\n${notice.body}`,
        status: pushed > 0 ? 'sent' : 'no_device',
        provider: 'web-push',
      }),
    );
  }

  /** An organiser switches their emails on or off. */
  async setOrganiserEmails(userId: string, on: boolean) {
    await this.usersRepo.update(userId, { emailNotices: on });
    return { emailNotices: on };
  }

  /** Fire-and-forget wrapper so a notification problem never breaks the request. */
  later(fn: () => Promise<unknown>) {
    fn().catch((err) => this.logger.warn(`Notification failed: ${err?.message ?? err}`));
  }
}

/** Hosts browsers use for Web Push (Chrome/Edge via FCM, Firefox, Safari, Windows). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^(.+\.)?push\.apple\.com$/, /^(.+\.)?notify\.windows\.com$/];

export function isPushServiceUrl(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && !url.port && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname));
}
