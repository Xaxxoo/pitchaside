import { dialNumber, phoneAdvice, readPhone, tidyPhone } from './phone';
import * as apps from '@pitchaside/shared';
import { phoneKey } from './format.util';

const NG = '2348031234567';

describe('readPhone: every way a Nigerian number gets typed', () => {
  it.each([
    '08031234567', '0803 123 4567', '0803-123-4567', '0803.123.4567', '(0803) 123 4567', ' 0803 123 4567 ',
    '8031234567', '803 123 4567',
    '+2348031234567', '+234 803 123 4567', '+234-803-123-4567', '+234 (0) 803 123 4567', '+234(0)8031234567',
    '2348031234567', '234 803 123 4567', '+234 0803 123 4567', '23408031234567', '234-0803-123-4567',
    '002348031234567', '00 234 803 123 4567',
    'O803 123 4567', 'o8031234567', '0803 I23 4567'.replace('I', '1'),
    '0803 123 4567 / 0812 000 1111', '0803 123 4567, 0812 000 1111', '0803 123 4567 or 0812 000 1111', '08031234567;09011112222',
    '0803 123 4567 ext 12', '08031234567 x3',
    '٠٨٠٣١٢٣٤٥٦٧', '０８０３１２３４５６７',
    'Tel: 0803 123 4567',
  ])('%s', (typed) => {
    const r = readPhone(typed);
    expect(r).toEqual({ ok: true, wa: NG, pretty: '+234 803 123 4567', nigerian: true });
  });

  it.each([
    ['07031234567', '2347031234567'],
    ['09031234567', '2349031234567'],
    ['08121234567', '2348121234567'],
    ['09151234567', '2349151234567'],
    ['07021234567', '2347021234567'],
  ])('every network prefix: %s', (typed, wa) => expect(dialNumber(typed)).toBe(wa));
});

describe('readPhone: numbers from elsewhere', () => {
  it.each([
    ['+44 7700 900123', '447700900123'],
    ['0044 7700 900123', '447700900123'],
    ['+1 (415) 555-0100', '14155550100'],
    ['+233 24 123 4567', '233241234567'],
    ['+27 82 123 4567', '27821234567'],
    ['447700900123', '447700900123'],
  ])('%s', (typed, wa) => {
    const r = readPhone(typed);
    expect(r.ok && r.wa).toBe(wa);
    expect(r.ok && r.nigerian).toBe(false);
    expect(r.ok && r.pretty).toBe(`+${wa}`);
  });
});

describe('readPhone: not a number it can use (no guessing)', () => {
  it.each([
    [null, 'empty'], [undefined, 'empty'], ['', 'empty'], ['   ', 'empty'], ['n/a', 'empty'], ['none', 'empty'],
    ['0803123456', 'short'], ['0803 123', 'short'], ['803123456', 'short'], ['+234 803 123 456', 'short'], ['234803123456', 'short'],
    ['080312345678', 'long'], ['80312345678', 'long'], ['+234 803 123 45678', 'long'], ['+1234567890123456', 'long'],
    ['+12345', 'short'], ['12345', 'short'],
    ['024 123 4567', 'short'],
  ])('%p → %s', (typed, reason) => {
    expect(readPhone(typed as any)).toEqual({ ok: false, reason });
    expect(dialNumber(typed as any)).toBeNull();
  });
});

describe('phoneAdvice: what to say under the box', () => {
  it('a good number says how WhatsApp will read it', () => expect(phoneAdvice('0803 123 4567')).toEqual({ ok: true, text: 'WhatsApp: +234 803 123 4567' }));
  it('nothing typed: nothing said', () => expect(phoneAdvice('')).toBeNull());
  it('too short / too long / unclear each say how to fix it', () => {
    expect(phoneAdvice('0803 123')!.text).toMatch(/Too short.*0803 123 4567/);
    expect(phoneAdvice('080312345678')!.text).toMatch(/Too many digits/);
    expect(phoneAdvice('080312345678')!.ok).toBe(false);
  });
});

describe('readPhone: fuzz', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const digit = () => String(Math.floor(rnd() * 10));
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const styles: ((n: string) => string)[] = [
    (n) => `0${n}`, (n) => n, (n) => `+234${n}`, (n) => `234${n}`, (n) => `+2340${n}`, (n) => `2340${n}`, (n) => `00234${n}`,
    (n) => `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`, (n) => `0${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`,
    (n) => `+234 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`, (n) => `+234 (0) ${n.slice(0, 3)} ${n.slice(3)}`,
    (n) => `(0${n.slice(0, 3)}) ${n.slice(3)}`, (n) => `0${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`,
    (n) => ` 0${n} `, (n) => `0${n} / 0${n.split('').reverse().join('')}`, (n) => `0${n} ext 4`,
    (n) => `O${n}`, (n) => `+234-${n.slice(0, 3)}-${n.slice(3)}`, (n) => `00 234 ${n}`, (n) => `${n.slice(0, 3)} ${n.slice(3)}`,
  ];

  it('20,000 real numbers in 20 styles all read the same, and keep matching people as before', () => {
    let checked = 0;
    for (let i = 0; i < 20_000; i++) {
      const n = pick(['70', '80', '81', '90', '91']) + Array.from({ length: 8 }, digit).join('');
      const typed = pick(styles)(n);
      const r = readPhone(typed);
      expect(r.ok && r.wa).toBe(`234${n}`);
      // Read twice (its own pretty form) and it's the same number.
      expect(r.ok && dialNumber(r.pretty)).toBe(`234${n}`);
      // People are matched by their last 10 digits: unchanged.
      expect(phoneKey(typed.split(' / ')[0].replace(/ ext.*/, '').replace('O', '0'))).toBe(n);
      checked++;
    }
    expect(checked).toBe(20_000);
  });

  it('random junk never throws, and anything it accepts is 8–15 digits', () => {
    const chars = '0123456789+-() ./oOx,abc٠١٢';
    for (let i = 0; i < 20_000; i++) {
      const s = Array.from({ length: Math.floor(rnd() * 22) }, () => chars[Math.floor(rnd() * chars.length)]).join('');
      const r = readPhone(s);
      if (r.ok) expect(r.wa).toMatch(/^\d{8,15}$/);
    }
  });
});

describe('tidyPhone: what the server saves', () => {
  it('a number typed the usual way is kept exactly as typed', () => {
    for (const t of ['08031234567', '0803 123 4567', '+234 803 123 4567', '0803-123-4567']) expect(tidyPhone(t)).toBe(t);
  });
  it('one the server used to refuse, but can be read, is saved tidy', () => {
    expect(tidyPhone('O803 123 4567')).toBe('0803 123 4567');
    // Used to be refused for starting with a bracket.
    expect(tidyPhone('(0803) 123-4567')).toBe('0803 123 4567');
    expect(tidyPhone('Tel: 0803 123 4567')).toBe('0803 123 4567');
    expect(tidyPhone('0803 123 4567 / 0812 000 1111')).toBe('0803 123 4567');
    expect(tidyPhone('٠٨٠٣١٢٣٤٥٦٧')).toBe('0803 123 4567');
    expect(tidyPhone('0044 7700 900123')).toBe('0044 7700 900123');
  });
  it('junk is left for the form check to refuse; non-strings pass through', () => {
    expect(tidyPhone('hello')).toBe('hello');
    expect(tidyPhone(undefined)).toBeUndefined();
    expect(tidyPhone('')).toBe('');
  });
});

describe('the form check now takes every number the app says WhatsApp can read', () => {
  const { validateSync } = require('class-validator');
  const { plainToInstance } = require('class-transformer');
  const { CreatePlayerDto } = require('../players/dto/create-player.dto');
  it.each(['O803 123 4567', 'Tel: 0803 123 4567', '0803 123 4567 / 0812 000 1111', '٠٨٠٣١٢٣٤٥٦٧', '+234 (0) 803 123 4567', '08031234567'])('%s is accepted', (phone) => {
    const dto = plainToInstance(CreatePlayerDto, { firstName: 'Ada', lastName: 'Obi', phone });
    const errors = validateSync(dto).filter((e: any) => e.property === 'phone');
    expect(errors).toEqual([]);
    expect(readPhone(dto.phone).ok).toBe(true);
  });
  it('junk is still refused', () => {
    const dto = plainToInstance(CreatePlayerDto, { firstName: 'Ada', lastName: 'Obi', phone: 'call me' });
    expect(validateSync(dto).some((e: any) => e.property === 'phone')).toBe(true);
  });
});

describe('the server and the apps read every number the same way', () => {
  it('table, fuzz and junk: identical answers from both copies', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const chars = '0123456789+-() ./oOx,abc٠١٢/';
    const samples = ['08031234567', '+234 (0) 803 123 4567', 'O803 123 4567', '0044 7700 900123', 'Tel: 0803 123 4567', '0803 123', '', 'n/a'];
    for (let i = 0; i < 20_000; i++) samples.push(Array.from({ length: Math.floor(rnd() * 20) }, () => chars[Math.floor(rnd() * chars.length)]).join(''));
    for (const s of samples) {
      expect(readPhone(s)).toEqual(apps.readPhone(s));
      expect(tidyPhone(s)).toEqual(apps.tidyPhone(s));
      expect(phoneAdvice(s)).toEqual(apps.phoneAdvice(s));
    }
  });
});
