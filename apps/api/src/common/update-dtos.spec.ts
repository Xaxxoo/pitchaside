import { ValidationPipe } from '@nestjs/common';
import { UpdatePlayerDto } from '../players/dto/create-player.dto';
import { UpdateGroupDto } from '../groups/dto/create-group.dto';

/** The pipe main.ts installs globally. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const body = (metatype: any, value: object) => pipe.transform(value, { type: 'body', metatype });

describe('edit bodies are validated and whitelisted', () => {
  it('keeps the fields a player edit may change and drops the rest', async () => {
    const out = await body(UpdatePlayerDto, { firstName: 'Tobi', id: 'x', organizationId: 'y', createdAt: 'z' });
    expect(out).toEqual(Object.assign(new UpdatePlayerDto(), { firstName: 'Tobi' }));
  });

  it('rejects an invalid player edit', async () => {
    await expect(body(UpdatePlayerDto, { email: 'not-an-email' })).rejects.toBeDefined();
  });

  it('keeps group settings and drops account, payee and ownership fields', async () => {
    const out = await body(UpdateGroupDto, {
      name: 'Tuesday Night 5-a-side',
      feePerPlayer: 3000,
      id: 'x',
      organizationId: 'y',
      accountNumber: '0000000000',
      payeeAccount: '1111111111',
    });
    expect(out).toEqual(Object.assign(new UpdateGroupDto(), { name: 'Tuesday Night 5-a-side', feePerPlayer: 3000 }));
  });

  it('rejects an invalid group edit', async () => {
    await expect(body(UpdateGroupDto, { feePerPlayer: -5 })).rejects.toBeDefined();
  });
});

describe('clearing optional player fields', () => {
  it('lets a player edit clear the phone number with null', async () => {
    const out = await body(UpdatePlayerDto, { phone: null, email: null });
    expect(out).toEqual(Object.assign(new UpdatePlayerDto(), { phone: null, email: null }));
  });
});
