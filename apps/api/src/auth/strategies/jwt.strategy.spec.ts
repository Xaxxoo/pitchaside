import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

/** Only plain session tokens sign a request in; the 2FA challenge (typ '2fa') never does. */
describe('JwtStrategy.validate', () => {
  const user = { id: 'user-1', removedAt: null };
  // Passport needs the Nest runtime to construct the strategy; validate only needs usersService.
  const validate = (payload: { sub: string; typ?: string }) =>
    JwtStrategy.prototype.validate.call({ usersService: { findById: async () => user } }, payload);

  it('accepts a session token', async () => {
    await expect(validate({ sub: 'user-1' })).resolves.toBe(user);
  });

  it('refuses a 2FA challenge used as a session', async () => {
    await expect(validate({ sub: 'user-1', typ: '2fa' })).rejects.toThrow(UnauthorizedException);
  });
});
