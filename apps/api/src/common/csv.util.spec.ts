import { toCsv } from './csv.util';

describe('toCsv', () => {
  it("never lets a name run as a formula when the export is opened in a spreadsheet", () => {
    const csv = toCsv(['name'], [['=HYPERLINK("http://x","click")'], ['@SUM(A1)'], ['-2+3'], ['\tcmd']]);
    expect(csv.split('\n').slice(1)).toEqual([`"'=HYPERLINK(""http://x"",""click"")"`, `'@SUM(A1)`, `'-2+3`, `'\tcmd`]);
  });

  it('leaves phone numbers, amounts and ordinary text as they are', () => {
    expect(toCsv(['a', 'b', 'c', 'd'], [['+2348012345678', '-500', '3,000', 'Ade, Jr']])).toBe('a,b,c,d\n+2348012345678,-500,"3,000","Ade, Jr"');
  });
});
