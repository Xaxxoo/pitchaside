import { normaliseAccount, payerNameFrom, whoSent } from './payer-name';

describe('payerNameFrom', () => {
  it('uses the sender field when the bank fills it', () => {
    expect(payerNameFrom('ADA OBI', 'Transfer from SOMEONE ELSE')).toBe('ADA OBI');
  });

  it('reads the name from the narration when the sender field is empty', () => {
    expect(payerNameFrom(null, 'Transfer from DAVID OREKOYA')).toBe('DAVID OREKOYA');
    expect(payerNameFrom('', 'TRF FROM SEGUN JOHN/0123456789')).toBe('SEGUN JOHN');
    expect(payerNameFrom(undefined, 'Transfer from EZRA ENEZE to SATURDAY BALLERS')).toBe('EZRA ENEZE');
    expect(payerNameFrom('  ', 'transfer from Ugonna Okafor - saturday ball')).toBe('Ugonna Okafor');
  });

  it('gives up when there is no full name to go on', () => {
    expect(payerNameFrom(null, 'saturday ball')).toBeNull();
    expect(payerNameFrom(null, 'Transfer from ADA')).toBeNull();
    expect(payerNameFrom(null, null)).toBeNull();
  });
});

describe('whoSent', () => {
  const squad = [
    { playerId: 'ada', paymentRef: 'PA7K3FQ', firstName: 'Ada', lastName: 'Obi' },
    { playerId: 'bisi', paymentRef: 'PAJD7CY', firstName: 'Bisi', lastName: 'Lawal' },
    { playerId: 'bisi2', paymentRef: null, firstName: 'Bisi', lastName: 'Lawal-Ade' },
  ];

  it('goes by the payment code first, whatever the name says', () => {
    expect(whoSent(squad, 'Bisi Lawal', 'pa-7k3fq football')).toBe('ada');
  });

  it('goes by the sender field, then by the name in the narration', () => {
    expect(whoSent(squad, 'ADA OBI', null)).toBe('ada');
    expect(whoSent(squad, '', 'Transfer from ADA OBI to PitchAside')).toBe('ada');
  });

  it('finds the code after a word shaped like one, such as "payment"', () => {
    expect(whoSent(squad, 'SOMEONE ELSE', 'Payment for football PA7K3FQ')).toBe('ada');
    expect(whoSent(squad, '', 'PAYMENT PAYMENT pa-jd7cy')).toBe('bisi');
  });

  it('never matches a member whose name has no usable words', () => {
    const withInitials = [...squad, { playerId: 'jo', paymentRef: null, firstName: 'J.', lastName: 'O' }];
    expect(whoSent(withInitials, 'CHIOMA EZE', null)).toBeNull();
    expect(whoSent(withInitials, 'ADA OBI', null)).toBe('ada');
  });

  it('leaves it to a person when the name fits no one or more than one', () => {
    expect(whoSent(squad, '', 'Transfer from MUM')).toBeNull();
    expect(whoSent(squad, 'Bisi Lawal Ade', null)).toBeNull();
  });
});

describe('accounts', () => {
  const squad = [
    { playerId: 'ada', paymentRef: 'PA7K3FQ', firstName: 'Ada', lastName: 'Obi' },
    { playerId: 'bisi', paymentRef: 'PAJD7CY', firstName: 'Bisi', lastName: 'Lawal' },
  ];

  it('compares accounts by their last 10 digits', () => {
    expect(normaliseAccount('0123456789')).toBe('0123456789');
    expect(normaliseAccount('234-0123456789')).toBe('0123456789');
    expect(normaliseAccount('12345')).toBeNull();
    expect(normaliseAccount(undefined)).toBeNull();
  });

  it("recognises an account that has only paid for one player, even with no name", () => {
    expect(whoSent(squad, '', 'POS/WEB TRF', 'bisi')).toBe('bisi');
  });

  it('still lets the payment code win over the account', () => {
    expect(whoSent(squad, '', 'PA7K3FQ', 'bisi')).toBe('ada');
  });

  it('trusts the account when the name agrees or fits no member', () => {
    expect(whoSent(squad, 'BISI LAWAL', 'fives', 'bisi')).toBe('bisi');
    expect(whoSent(squad, 'MRS LAWAL', 'fives', 'bisi')).toBe('bisi');
  });

  it("goes by the sender's own name when it points at someone else than the account", () => {
    // Ada once paid for Bisi from this account; now she pays for herself, with no code: it's Ada's.
    expect(whoSent(squad, 'ADA OBI', 'fives', 'bisi')).toBe('ada');
  });

  it("doesn't trust the account when the sender's name fits nobody it paid for", () => {
    // Tunde paid for Bisi once; his own transfer (his bank name, no code) isn't Bisi's.
    expect(whoSent(squad, 'BAKARE OLATUNDE', 'fives', 'bisi')).toBeNull();
  });

  it("ignores an account owner who has since left the group", () => {
    expect(whoSent(squad, '', 'POS/WEB TRF', 'gone')).toBeNull();
  });
});
