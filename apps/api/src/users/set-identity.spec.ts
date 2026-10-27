import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

/** A BVN or NIN can only be on one organiser account, so one identity can't open accounts for many clubs. */
describe('UsersService.setIdentity', () => {
  function setup(takenBy: string | null) {
    const usersRepo = {
      findOne: jest.fn(async (o: any) => (o.select ? (takenBy ? { id: takenBy } : null) : { id: 'u1', nin: '12345678901' })),
      update: jest.fn(),
    };
    return { svc: new UsersService(usersRepo as any, {} as any, {} as any), usersRepo };
  }

  it("refuses a number that's already on another organiser's account", async () => {
    const { svc, usersRepo } = setup('someone-else');
    await expect(svc.setIdentity('u1', { nin: '12345678901' })).rejects.toThrow(ConflictException);
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('saves a number nobody else has', async () => {
    const { svc, usersRepo } = setup(null);
    await svc.setIdentity('u1', { nin: '12345678901' });
    expect(usersRepo.update).toHaveBeenCalledWith('u1', { nin: '12345678901' });
  });
});
