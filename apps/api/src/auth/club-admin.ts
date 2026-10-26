import { ForbiddenException } from '@nestjs/common';
import { User, UserRole } from '../users/entities/user.entity';

/**
 * Collection accounts are opened in the club admin's name, with their BVN or NIN: co-organisers
 * and treasurers can use an account once it's open, but can't open one or add identity numbers.
 */
export function assertClubAdmin(user: Pick<User, 'role'>) {
  if (user.role !== UserRole.ORG_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only the club admin can do this. Ask them to open the account.');
  }
}
