// Keep @nestjs/jwt's ESM out of the test run (the service imports PlayerAuthService for its type).
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));

import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { SignInLinksService } from './sign-in-links.service';

/** In-memory stand-ins: one club, one organiser, a few players. */
function setup(opts: { players?: any[]; elsewhere?: boolean; organises?: boolean; account?: any } = {}) {
  const links: any[] = [];
  const players = opts.players ?? [{ id: 'p1', firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', phone: '08031234567', organizationId: 'org1' }];
  const saved: any[] = [];
  const linksRepo = {
    create: (x: any) => ({ ...x }),
    save: async (x: any) => (links.push({ id: `l${links.length + 1}`, usedAt: null, ...x }), x),
    findOne: async ({ where }: any) => links.find((l) => l.tokenHash === where.tokenHash) ?? null,
    update: async (where: any, set: any) => {
      const hit = links.filter((l) => (where.id ? l.id === where.id : l.playerId === where.playerId) && !l.usedAt);
      hit.forEach((l) => Object.assign(l, set));
      return { affected: hit.length };
    },
  };
  const playersRepo = {
    findOne: async ({ where }: any) => players.find((p) => p.id === where.id && (!where.organizationId || p.organizationId === where.organizationId)) ?? null,
    save: async (p: any) => p,
    createQueryBuilder: () => {
      let key = '';
      const qb: any = { where: (_: string, v: any) => ((key = v.key), qb), getCount: async () => players.filter((p) => p.email?.toLowerCase() === key).length };
      return qb;
    },
  };
  const account = opts.account ?? { personKey: 'ada@example.com', passwordHash: 'old' };
  const accountsRepo = { findOne: async () => opts.account ?? null, save: async (a: any) => (saved.push(a), a) };
  const auth = {
    findPlayersByKey: async () => (opts.elsewhere ? [{ organizationId: 'org2' }] : [{ organizationId: 'org1' }]),
    findOrganisersByKey: async () => (opts.organises ? [{}] : []),
    accountFor: async (key: string) => ({ ...account, personKey: key }),
  };
  const svc = new SignInLinksService(linksRepo as never, playersRepo as never, accountsRepo as never, auth as never);
  const organiser = { organizationId: 'org1', firstName: 'Tunde', lastName: 'B' } as never;
  return { svc, organiser, links, saved, players };
}

describe('SignInLinksService', () => {
  it('makes a link for a player in the club, and it works once', async () => {
    const { svc, organiser, saved } = setup();
    const { token, firstName } = await svc.create(organiser, 'p1');
    expect(firstName).toBe('Ada');
    expect((await svc.peek(token)).email).toBe('a•••@example.com');
    const used = await svc.use(token, 'newpass123');
    expect(used.email).toBe('ada@example.com');
    expect(saved[0].passwordHash).not.toBe('old');
    await expect(svc.use(token, 'again12345')).rejects.toBeInstanceOf(GoneException);
  });

  it('never for a player in another club', async () => {
    const { svc, organiser } = setup();
    await expect(svc.create({ ...(organiser as any), organizationId: 'org9' }, 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a newer link cancels the older one', async () => {
    const { svc, organiser } = setup();
    const first = await svc.create(organiser, 'p1');
    await svc.create(organiser, 'p1');
    await expect(svc.peek(first.token)).rejects.toBeInstanceOf(GoneException);
  });

  it('runs out after 24 hours', async () => {
    const { svc, organiser, links } = setup();
    const { token } = await svc.create(organiser, 'p1');
    links[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.peek(token)).rejects.toBeInstanceOf(GoneException);
  });

  it('refuses players who use PitchAside beyond the club (they reset it themselves)', async () => {
    await expect(setup({ elsewhere: true }).svc.create(setup().organiser, 'p1')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup({ organises: true }).svc.create(setup().organiser, 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a player with no email gives one; an email already on PitchAside is refused', async () => {
    const players = [
      { id: 'p2', firstName: 'Kunle', lastName: 'A', email: null, phone: '08031112222', organizationId: 'org1' },
      { id: 'p3', firstName: 'Femi', lastName: 'K', email: 'femi@example.com', organizationId: 'org1' },
    ];
    const { svc, organiser } = setup({ players });
    const { token, hasEmail } = await svc.create(organiser, 'p2');
    expect(hasEmail).toBe(false);
    expect((await svc.peek(token)).email).toBeNull();
    await expect(svc.use(token, 'newpass123')).rejects.toThrow('Add your email');
    await expect(svc.use(token, 'newpass123', 'FEMI@example.com')).rejects.toBeInstanceOf(ConflictException);
    const used = await svc.use(token, 'newpass123', 'kunle@example.com');
    expect(used.email).toBe('kunle@example.com');
    expect(players[0].email).toBe('kunle@example.com');
  });
});
