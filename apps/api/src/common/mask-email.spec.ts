import { maskEmail } from './format.util';

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('Tunde.Bakare@Gmail.com')).toBe('t•••@gmail.com');
  });
  it('never echoes something that is not an email', () => {
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});
