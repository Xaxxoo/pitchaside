import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TRANSFER_PIN_LOCK_MS, TRANSFER_PIN_MAX_ATTEMPTS, UsersService } from './users.service';
import { User } from './entities/user.entity';

/** UsersService over one in-memory user whose transfer PIN is 1234. */
async function setup() {
  const user = {
    id: 'u1',
    transferPin: await bcrypt.hash('1234', 4),
    transferPinFailedAttempts: 0,
    transferPinLockedUntil: null,
  } as unknown as User;
  const repo = {
    findOneOrFail: async () => ({ ...user }),
    update: async (_id: string, patch: Partial<User>) => Object.assign(user, patch),
    increment: async (_where: unknown, field: keyof User, by: number) => {
      (user as any)[field] = (user[field] as number) + by;
    },
    save: async (u: User) => Object.assign(user, u),
  };
  const service = new UsersService(repo as any, {} as any, {} as any);
  return { service, user };
}

describe('transfer PIN lockout', () => {
  it('accepts the right PIN and rejects a wrong one', async () => {
    const { service } = await setup();
    expect(await service.verifyTransferPin('u1', '1234')).toBe(true);
    expect(await service.verifyTransferPin('u1', '0000')).toBe(false);
  });

  it(`locks after ${TRANSFER_PIN_MAX_ATTEMPTS} wrong PINs in a row, even for the right one`, async () => {
    const { service, user } = await setup();
    for (let i = 0; i < TRANSFER_PIN_MAX_ATTEMPTS - 1; i++) expect(await service.verifyTransferPin('u1', '0000')).toBe(false);
    await expect(service.verifyTransferPin('u1', '0000')).rejects.toThrow('Too many wrong PINs');

    expect(user.transferPinLockedUntil!.getTime()).toBeGreaterThan(Date.now() + TRANSFER_PIN_LOCK_MS - 5000);
    await expect(service.verifyTransferPin('u1', '1234')).rejects.toThrow(BadRequestException);
  });

  it('counts guesses sent at the same time', async () => {
    const { service, user } = await setup();
    await Promise.allSettled(Array.from({ length: 8 }, () => service.verifyTransferPin('u1', '0000')));
    expect(user.transferPinLockedUntil).not.toBeNull();
  });

  it('starts counting again after a right PIN', async () => {
    const { service, user } = await setup();
    await service.verifyTransferPin('u1', '0000');
    await service.verifyTransferPin('u1', '0000');
    expect(await service.verifyTransferPin('u1', '1234')).toBe(true);
    expect(user.transferPinFailedAttempts).toBe(0);
  });

  it('opens again once the lock has passed', async () => {
    const { service, user } = await setup();
    user.transferPinLockedUntil = new Date(Date.now() - 1000);
    expect(await service.verifyTransferPin('u1', '1234')).toBe(true);
    expect(user.transferPinLockedUntil).toBeNull();
  });

  it("can't be used to guess the current PIN when changing it", async () => {
    const { service } = await setup();
    for (let i = 0; i < TRANSFER_PIN_MAX_ATTEMPTS - 1; i++) await expect(service.setTransferPin('u1', '9999', '0000')).rejects.toThrow('Current PIN is incorrect');
    await expect(service.setTransferPin('u1', '9999', '0000')).rejects.toThrow('Too many wrong PINs');
    await expect(service.setTransferPin('u1', '9999', '1234')).rejects.toThrow('Too many wrong PINs');
  });
});
