import { PITCH_FACILITY_LABEL, PITCH_SURFACE_LABEL, type PitchFacility, type PitchSurface } from '@pitchaside/shared';
import { formatCurrency } from '@/lib/api';

/** Naira, whole, as the rest of the app shows it. */
export const naira = (n: number | string) => formatCurrency(Number(n));

type Facts = { aSide?: number | null; surface?: string | null; lengthM?: number | null; widthM?: number | null; facilities?: string[] };

/** The pitch in a few words, biggest facts first: "5-a-side · Astro turf · 40 × 20 m · Floodlights". */
export function pitchFacts(p: Facts, withFacilities = true): string[] {
  const out: string[] = [];
  if (p.aSide) out.push(`${p.aSide}-a-side`);
  if (p.surface) out.push(PITCH_SURFACE_LABEL[p.surface as PitchSurface] ?? p.surface);
  if (p.lengthM && p.widthM) out.push(`${p.lengthM} × ${p.widthM} m`);
  if (withFacilities) for (const f of p.facilities ?? []) out.push(PITCH_FACILITY_LABEL[f as PitchFacility] ?? f);
  return out;
}

/** "every day", "6 days a week", "no hours set": short enough for a row's one line. */
export function hoursSummary(openDays: number) {
  if (!openDays) return 'no hours set';
  return openDays === 7 ? 'every day' : `${openDays} day${openDays === 1 ? '' : 's'} a week`;
}

/** Outline icons (24px viewBox) for the pitch screens. */
export const PITCH_ICONS = {
  camera: 'M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
  pin: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z',
  pitch: 'M3.75 5.25h16.5v13.5H3.75zM12 5.25v13.5M14.25 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM3.75 9h2.25v6H3.75M20.25 9H18v6h2.25',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  bank: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z',
  wallet: 'M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3',
};
