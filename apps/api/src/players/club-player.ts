import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { emailKey, phoneKey } from '../common/format.util';
import { Player } from './entities/player.entity';

export interface ClubPerson {
  email: string;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
}

/**
 * This person's player record in one club, created if they're new there.
 *
 * People are matched by email. The one exception keeps history for players an
 * organiser added by phone number before email sign-in existed: if the club has
 * a record with this person's number and no email, that record is theirs.
 */
export async function clubPlayerFor(repo: Repository<Player>, organizationId: string, person: ClubPerson): Promise<Player> {
  return (await clubPlayerMatch(repo, organizationId, person)).player;
}

/** The club's record with this phone number (last 10 digits), if any. */
export function playerByPhone(repo: Repository<Player>, organizationId: string, phone: string | null | undefined) {
  const digits = phone ? phoneKey(phone) : '';
  if (digits.length < 10) return Promise.resolve(null);
  return repo
    .createQueryBuilder('p')
    .where('p.organizationId = :org', { org: organizationId })
    .andWhere(`regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') LIKE :suffix`, { suffix: `%${digits}` })
    .getOne();
}

/**
 * clubPlayerFor, also saying when the number they gave is already on someone else's record
 * (`clash`), so the organiser can be told about a likely duplicate. `claimByPhone: false` is the
 * person saying "that's not me" to the record their number found: they get a new record.
 */
export async function clubPlayerMatch(
  repo: Repository<Player>,
  organizationId: string,
  person: ClubPerson,
  { claimByPhone = true }: { claimByPhone?: boolean } = {},
): Promise<{ player: Player; clash: Player | null }> {
  const key = emailKey(person.email);
  const inClub = () => repo.createQueryBuilder('p').where('p.organizationId = :org', { org: organizationId });

  const byEmail = await inClub().andWhere('lower(p.email) = :key', { key }).getOne();
  if (byEmail) return { player: byEmail, clash: null };

  const byPhone = await playerByPhone(repo, organizationId, person.phone);
  if (byPhone && !byPhone.email && claimByPhone) {
    byPhone.email = key;
    return { player: await repo.save(byPhone), clash: null };
  }

  if (!person.firstName?.trim() || !person.lastName?.trim()) {
    throw new BadRequestException('First and last name are required');
  }
  const player = await repo.save(
    repo.create({
      firstName: person.firstName.trim(),
      lastName: person.lastName.trim(),
      email: key,
      // The number already belongs to someone else in this club (phone is unique per club).
      phone: byPhone ? null : person.phone?.trim() || null,
      organizationId,
    }),
  );
  return { player, clash: byPhone };
}
