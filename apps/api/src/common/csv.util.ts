/** A value a spreadsheet would run as a formula; a plain number (a phone, an amount) is left alone. */
const FORMULA = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d[\d.,\s]*$/;

export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (raw: string) => {
    // Names and notes can come from public sign-up forms: never let one run as a formula when the
    // organiser opens the export in Excel or Sheets.
    const val = FORMULA.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map((v) => escape(String(v ?? ''))).join(',')),
  ];

  return lines.join('\n');
}
