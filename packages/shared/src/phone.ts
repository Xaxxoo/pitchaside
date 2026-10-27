/**
 * Reading a phone number the way people actually type it, so WhatsApp links and messages reach
 * everyone. Numbers are stored as typed; this is how they're read when used. The app, the player
 * app and the server all use this one rule, so they never disagree about a number.
 *
 * Nigerian numbers in any shape read as 234 + the 10-digit number:
 *   0803 123 4567 · 803 123 4567 · +234 803 123 4567 · +234 (0) 803 123 4567 · 234-0803-123-4567
 *   · 002348031234567 · 0803.123.4567 · O803 123 4567 (a letter O for the zero)
 * Two numbers in one box ("0803… / 0812…") read as the first. "ext 12" on the end is dropped.
 * A number from elsewhere works when it's written with its code: +44 7700 900123, 0044 7700…
 *
 * Anything it can't be sure of is not a number it can use, with the reason: better no message
 * than one to a stranger.
 */

export type PhoneRead =
  | {
      ok: true;
      /** Digits with the country code, as WhatsApp and SMS gateways want it: "2348031234567". */
      wa: string;
      /** "+234 803 123 4567": the same way everywhere it's shown. */
      pretty: string;
      /** A Nigerian number. */
      nigerian: boolean;
    }
  | {
      ok: false;
      /** empty: nothing typed. short / long: wrong number of digits. unclear: can't tell which country. */
      reason: 'empty' | 'short' | 'long' | 'unclear';
    };

/** Digits in other scripts (Arabic-Indic, Persian, full-width) as 0–9. */
function plainDigits(s: string) {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/＋/g, '+');
}

export function readPhone(input?: string | null): PhoneRead {
  let raw = plainDigits(String(input ?? '')).trim();
  if (!raw) return { ok: false, reason: 'empty' };
  // Two numbers in one box: the first.
  raw = raw.split(/\s*(?:[,;/|\n]|\bor\b|&)\s*/i).find((part) => /\d/.test(part)) ?? raw;
  // An extension on the end.
  raw = raw.replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i, '');
  // A letter O where a zero belongs, in something that's otherwise a number.
  if (/^[+\d\s().\-oO]+$/.test(raw) && (raw.match(/\d/g) ?? []).length >= 7) raw = raw.replace(/[oO]/g, '0');
  // "+234 (0) 803…": the (0) is only there for dialling at home.
  raw = raw.replace(/\(\s*0\s*\)/g, '');
  const plus = raw.startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (!d) return { ok: false, reason: 'empty' };
  if (!plus && d.startsWith('00')) d = d.slice(2);
  const intl = plus || /^\D*00/.test(raw);

  let wa: string | null = null;
  if (d.startsWith('2340') && d.length === 14) wa = `234${d.slice(4)}`;
  else if (d.startsWith('234') && d.length === 13) wa = d;
  else if (d.startsWith('234')) return { ok: false, reason: d.length < 13 ? 'short' : 'long' };
  else if (intl) {
    if (d.length < 8) return { ok: false, reason: 'short' };
    if (d.length > 15) return { ok: false, reason: 'long' };
    wa = d;
  } else if (d.startsWith('0')) {
    if (d.length === 11) wa = `234${d.slice(1)}`;
    else return { ok: false, reason: d.length < 11 ? 'short' : d.length > 11 ? 'long' : 'unclear' };
  } else if (/^[789]/.test(d)) {
    if (d.length === 10) wa = `234${d}`;
    else return { ok: false, reason: d.length < 10 ? 'short' : 'long' };
  } else if (d.length >= 11 && d.length <= 15) {
    // Written with its country code but no +: "447700900123".
    wa = d;
  } else return { ok: false, reason: d.length < 11 ? 'short' : 'long' };

  const nigerian = wa.startsWith('234') && wa.length === 13;
  return {
    ok: true,
    wa,
    pretty: nigerian ? `+234 ${wa.slice(3, 6)} ${wa.slice(6, 9)} ${wa.slice(9)}` : `+${wa}`,
    nigerian,
  };
}

/** Just the digits for WhatsApp or SMS ("2348031234567"), or null when it isn't a number we can use. */
export function dialNumber(input?: string | null): string | null {
  const r = readPhone(input);
  return r.ok ? r.wa : null;
}

/** What to tell someone about the number they typed: how it'll be read, or what's wrong with it. */
export function phoneAdvice(input?: string | null): { ok: boolean; text: string } | null {
  const r = readPhone(input);
  if (r.ok) return { ok: true, text: `WhatsApp: ${r.pretty}` };
  if (r.reason === 'empty') return null;
  return {
    ok: false,
    text:
      r.reason === 'short'
        ? 'Too short for a phone number. Nigerian numbers have 11 digits: 0803 123 4567.'
        : r.reason === 'long'
          ? 'Too many digits. Nigerian numbers have 11: 0803 123 4567.'
          : 'WhatsApp can’t open this. Type it as 0803 123 4567, or with its country code: +44 7700 900123.',
  };
}

/** The shape the server has always taken: digits, spaces, dashes, dots, brackets, an optional +. */
const PLAIN = /^[+\d][\d\s\-().]{6,}$/;

/**
 * A number to save. One typed the usual way is kept exactly as typed. One the server used to
 * refuse but can be read ("O803…", "Tel: 0803…", two numbers in one box, other scripts' digits)
 * is saved tidy instead: 0803 123 4567 for Nigerian numbers, +44… for others. Anything else is
 * left as typed, for the form check to refuse.
 */
export function tidyPhone(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const typed = input.trim();
  if (!typed || PLAIN.test(typed)) return input;
  const r = readPhone(typed);
  if (!r.ok) return input;
  return r.nigerian ? `0${r.wa.slice(3, 6)} ${r.wa.slice(6, 9)} ${r.wa.slice(9)}` : r.pretty;
}
