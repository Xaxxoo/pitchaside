import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { canListPitches } from './pitch-access';

/** A pitch takes money: only a confirmed admin or pitch owner can list one or say where its money goes. */
describe('who can list a pitch', () => {
  const who = (role: UserRole, emailVerified: boolean) => ({ role, emailVerified, email: 'ada@example.com' });

  it('lets a confirmed group admin, pitch owner or super admin', () => {
    for (const role of [UserRole.ORG_ADMIN, UserRole.PITCH_OWNER, UserRole.SUPER_ADMIN]) expect(() => canListPitches(who(role, true))).not.toThrow();
  });

  it("refuses a treasurer or member, and says who can", () => {
    for (const role of [UserRole.TREASURER, UserRole.MEMBER]) expect(() => canListPitches(who(role, true))).toThrow(/group's admin or a pitch owner/);
  });

  it('refuses an unconfirmed email, and says where the link went', () => {
    expect(() => canListPitches(who(UserRole.PITCH_OWNER, false))).toThrow(ForbiddenException);
    expect(() => canListPitches(who(UserRole.ORG_ADMIN, false))).toThrow(/ada@example.com/);
  });
});
