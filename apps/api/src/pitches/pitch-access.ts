import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

/** Who can list a pitch, open its bank account and say where its money goes (decided 30 Oct with Matt). */
const LISTERS = [UserRole.ORG_ADMIN, UserRole.PITCH_OWNER, UserRole.SUPER_ADMIN];

/**
 * A group's admin or a pitch owner, with a confirmed email. The email matters: a pitch takes
 * money, so it must belong to someone who has shown the address is theirs.
 */
export function canListPitches(user: { role: UserRole; emailVerified?: boolean; email?: string }) {
  if (!LISTERS.includes(user.role)) {
    throw new ForbiddenException("Only a group's admin or a pitch owner can list a pitch. Ask your admin.");
  }
  if (!user.emailVerified) {
    throw new ForbiddenException(`Confirm your email first. We sent a link to ${user.email ?? 'your email'}.`);
  }
}
