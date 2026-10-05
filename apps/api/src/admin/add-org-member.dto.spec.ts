import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddOrgMemberDto } from './admin.controller';
import { RegisterDto } from '../auth/dto/register.dto';
import { UserRole } from '../users/entities/user.entity';

const errorsFor = async (cls: any, body: object) =>
  (await validate(plainToInstance(cls, body) as object)).map((e) => e.property);

describe('new passwords and co-admin invites', () => {
  const coAdmin = { firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', password: 'longenough', role: UserRole.TREASURER };

  it('accepts a complete co-admin invite', async () => {
    expect(await errorsFor(AddOrgMemberDto, coAdmin)).toEqual([]);
  });

  it('rejects a short password, a bad email, blank names and other roles', async () => {
    expect(await errorsFor(AddOrgMemberDto, { ...coAdmin, password: 'short7!' })).toEqual(['password']);
    expect(await errorsFor(AddOrgMemberDto, { ...coAdmin, email: 'not-an-email' })).toEqual(['email']);
    expect(await errorsFor(AddOrgMemberDto, { ...coAdmin, firstName: '' })).toEqual(['firstName']);
    expect(await errorsFor(AddOrgMemberDto, { ...coAdmin, role: UserRole.ORG_ADMIN })).toEqual(['role']);
  });

  it('needs at least 8 characters for a new organiser password', async () => {
    const base = { organizationName: 'Lekki Ballers', firstName: 'Tunde', lastName: 'Adeyemi', email: 't@example.com' };
    expect(await errorsFor(RegisterDto, { ...base, password: '1234567' })).toContain('password');
    expect(await errorsFor(RegisterDto, { ...base, password: '12345678' })).not.toContain('password');
  });
});
