import { borrowed, checkKeepers } from './keepers';

describe('who was in goal', () => {
  const pays = [
    { playerId: 'ada', attendance: null },
    { playerId: 'bisi', attendance: 'came' },
    { playerId: 'gone', attendance: 'no_show' },
  ];
  it('takes anyone playing today, for either side', () => {
    expect(checkKeepers(pays, { keeperA: 'ada', keeperB: 'bisi' })).toEqual({ keeperA: 'ada', keeperB: 'bisi' });
  });
  it('not recorded is fine; left out means unchanged', () => {
    expect(checkKeepers(pays, { keeperA: null })).toEqual({ keeperA: null });
    expect(checkKeepers(pays, {})).toEqual({});
    expect(checkKeepers(pays, { keeperA: '' })).toEqual({ keeperA: null });
  });
  it('turns down someone not playing, or who didn’t come', () => {
    expect(() => checkKeepers(pays, { keeperA: 'stranger' })).toThrow('someone playing today');
    expect(() => checkKeepers(pays, { keeperB: 'gone' })).toThrow('someone playing today');
  });
  it('one person can’t keep for both sides', () => {
    expect(() => checkKeepers(pays, { keeperA: 'ada', keeperB: 'ada' })).toThrow('both sides');
  });
  it('a keeper from another team, or none, is borrowed', () => {
    expect(borrowed('A', 'A')).toBe(false);
    expect(borrowed('C', 'A')).toBe(true);
    expect(borrowed(null, 'A')).toBe(true);
  });
});
