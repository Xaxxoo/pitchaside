import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { assertClubAdmin } from './club-admin';

/** Only the club admin opens collection accounts and adds the identity behind them. */
describe('assertClubAdmin', () => {
  it('lets the club admin through', () => {
    expect(() => assertClubAdmin({ role: UserRole.ORG_ADMIN })).not.toThrow();
  });

  it.each([UserRole.MEMBER, UserRole.TREASURER])('stops a %s', (role) => {
    expect(() => assertClubAdmin({ role })).toThrow(ForbiddenException);
  });
});
