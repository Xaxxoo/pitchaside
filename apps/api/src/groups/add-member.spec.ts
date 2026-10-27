import { NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

/** Adding a member: the player has to be one of this club's own players. */
describe('GroupsService.addMember', () => {
  function setup(playerInClub: boolean) {
    const membershipsRepo = {
      create: (m: any) => m,
      save: jest.fn(async (m: any) => m),
      manager: { getRepository: () => ({ exists: jest.fn(async () => playerInClub) }) },
    };
    const groupsRepo = { findOne: jest.fn(async () => ({ id: 'g1', organizationId: 'o1' })) };
    const billing = { onMemberAdded: jest.fn() };
    return { svc: new GroupsService(groupsRepo as any, membershipsRepo as any, billing as any, {} as any, {} as any), membershipsRepo };
  }

  it("refuses a player from another club", async () => {
    const { svc, membershipsRepo } = setup(false);
    await expect(svc.addMember('g1', { playerId: 'p-other-club' }, 'o1')).rejects.toThrow(NotFoundException);
    expect(membershipsRepo.save).not.toHaveBeenCalled();
  });

  it("adds the club's own player", async () => {
    const { svc, membershipsRepo } = setup(true);
    await svc.addMember('g1', { playerId: 'p1' }, 'o1');
    expect(membershipsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', playerId: 'p1' }));
  });
});
