import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateGroupDto } from './dto/create-group.dto';

const errorsFor = async (body: object) => (await validate(plainToInstance(UpdateGroupDto, body) as object)).map((e) => e.property);

/** Counting stats from a date: a real day, or null to count every match day again. */
describe('UpdateGroupDto statsFrom', () => {
  it('takes a date or null', async () => {
    expect(await errorsFor({ statsFrom: '2026-10-25' })).toEqual([]);
    expect(await errorsFor({ statsFrom: null })).toEqual([]);
  });

  it('refuses anything that is not a real day', async () => {
    expect(await errorsFor({ statsFrom: '25/10/2026' })).toEqual(['statsFrom']);
    expect(await errorsFor({ statsFrom: '2026-13-45' })).toEqual(['statsFrom']);
    expect(await errorsFor({ statsFrom: '2026-10-25T00:00:00Z' })).toEqual(['statsFrom']);
  });
});
