import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Player } from '../players/entities/player.entity';
import { User } from '../users/entities/user.entity';
import { emailKey, maskEmail } from '../common/format.util';
import { PlayerAccount } from './entities/player-account.entity';
import { SignInLink } from './entities/sign-in-link.entity';
import { PlayerAuthService } from './player-auth.service';

export const SIGN_IN_LINK_MS = 24 * 60 * 60 * 1000;
const GONE = 'This link has been used or has run out. Ask your organiser to send a new one.';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * "Send sign-in link": an organiser gets a player who can't sign in (forgot the password, never
 * set one, or was added without an email) into the app. The organiser sends the link to the
 * player's own WhatsApp; opening it lets them choose a password (and give an email if the
 * record has none), then signs them in. Once, for 24 hours.
 *
 * A link only reaches what the organiser already looks after: a player who also uses PitchAside
 * in another club, or who organises, resets their password themselves ("Forgot password"), so no
 * organiser can take over an account that reaches beyond their club.
 */
@Injectable()
export class SignInLinksService {
  constructor(
    @InjectRepository(SignInLink) private linksRepo: Repository<SignInLink>,
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    @InjectRepository(PlayerAccount) private accountsRepo: Repository<PlayerAccount>,
    private auth: PlayerAuthService,
  ) {}

  /** Why this player's account is out of an organiser's reach, or null when a link can be sent. */
  private async beyondClub(player: Player): Promise<string | null> {
    if (!player.email) return null;
    const key = emailKey(player.email);
    const elsewhere = (await this.auth.findPlayersByKey(key)).some((p) => p.organizationId !== player.organizationId);
    const organises = (await this.auth.findOrganisersByKey(key)).length > 0;
    return elsewhere || organises
      ? `${player.firstName} uses PitchAside outside your club too, so they reset it themselves: “Forgot password?” on the sign-in page emails them a code.`
      : null;
  }

  async create(organiser: User, playerId: string) {
    const player = await this.playersRepo.findOne({ where: { id: playerId, organizationId: organiser.organizationId } });
    if (!player) throw new NotFoundException('Player not found');
    const blocked = await this.beyondClub(player);
    if (blocked) throw new ConflictException(blocked);
    // A new link cancels any older one for them
    await this.linksRepo.update({ playerId: player.id, usedAt: IsNull() }, { usedAt: new Date() });
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_MS);
    await this.linksRepo.save(
      this.linksRepo.create({
        tokenHash: hash(token),
        playerId: player.id,
        organizationId: player.organizationId,
        createdBy: `${organiser.firstName} ${organiser.lastName}`.trim(),
        expiresAt,
      }),
    );
    return { token, expiresAt, firstName: player.firstName, phone: player.phone ?? null, hasEmail: !!player.email };
  }

  private async live(token: string) {
    const link = token ? await this.linksRepo.findOne({ where: { tokenHash: hash(token) } }) : null;
    if (!link || link.usedAt || link.expiresAt.getTime() < Date.now()) throw new GoneException(GONE);
    const player = await this.playersRepo.findOne({ where: { id: link.playerId }, relations: ['organization'] });
    if (!player) throw new GoneException(GONE);
    return { link, player };
  }

  /** What the link page shows before anything is used: who it's for, and whether an email is needed. */
  async peek(token: string) {
    const { player } = await this.live(token);
    return {
      firstName: player.firstName,
      clubName: player.organization?.name ?? null,
      email: player.email ? maskEmail(player.email) : null,
    };
  }

  /**
   * Uses the link: sets their password (and email, when the record has none), and returns the
   * email to start their session with. The link is marked used first, so it can't be used twice.
   */
  async use(token: string, password: string, email?: string) {
    const { link, player } = await this.live(token);
    const blocked = await this.beyondClub(player);
    if (blocked) throw new ConflictException(blocked);

    let key: string;
    if (player.email) {
      key = emailKey(player.email);
    } else {
      if (!email?.trim()) throw new BadRequestException('Add your email: you’ll sign in with it next time.');
      key = emailKey(email);
      // Someone else's email: never set a password on an account this link doesn't own
      const taken = await this.playersRepo
        .createQueryBuilder('p')
        .where('lower(p.email) = :key', { key })
        .getCount();
      const account = await this.accountsRepo.findOne({ where: { personKey: key } });
      const organiser = (await this.auth.findOrganisersByKey(key)).length > 0;
      if (taken || account || organiser) {
        throw new ConflictException('That email is already on PitchAside. Sign in with it, or use another email.');
      }
    }

    const claimed = await this.linksRepo.update({ id: link.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!claimed.affected) throw new GoneException(GONE);

    if (!player.email) {
      player.email = key;
      await this.playersRepo.save(player);
    }
    const account = await this.auth.accountFor(key);
    if (!account) throw new NotFoundException('Account not found');
    account.passwordHash = await bcrypt.hash(password, 10);
    await this.accountsRepo.save(account);
    return { email: key, firstName: player.firstName };
  }
}
