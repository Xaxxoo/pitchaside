import { ForbiddenException } from '@nestjs/common';
import { User, UserRole } from '../users/entities/user.entity';

/**
 * Only a pitch owner (or super admin) can manage pitches, schedules, and bookings.
 */
export function assertPitchOwner(user: Pick<User, 'role'>) {
  if (user.role !== UserRole.PITCH_OWNER && user.role !== UserRole.SUPER_ADMIN) {
    throw new ForbiddenException('Only a pitch owner can do this.');
  }
}
