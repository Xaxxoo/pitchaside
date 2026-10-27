import { CompetitionsService } from './competitions.service';

/** Updating a team changes its name and captain only: never its id, competition or payment state. */
describe('CompetitionsService.updateTeam', () => {
  it('ignores id, competition and status in the request', async () => {
    const team: any = { id: 't1', competitionId: 'c1', name: 'Old', registrationStatus: 'pending_payment' };
    const teamsRepo = { findOne: jest.fn(async () => team), save: jest.fn(async (t: any) => t) };
    const competitionsRepo = { findOne: jest.fn(async () => ({ id: 'c1', organizationId: 'o1' })) };
    const svc = new CompetitionsService(competitionsRepo as any, teamsRepo as any, {} as any, {} as any, {} as any);

    const body: any = { id: 'victim-team', competitionId: 'other-club-cup', registrationStatus: 'confirmed', name: 'New Name' };
    const saved = await svc.updateTeam('c1', 't1', 'o1', body);

    expect(saved).toMatchObject({ id: 't1', competitionId: 'c1', registrationStatus: 'pending_payment', name: 'New Name' });
  });
});
