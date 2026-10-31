import { BASE_URL, http } from './http';
import type {
  IPitch,
  IPitchSchedule,
  IPitchSlotOverride,
  IPitchBooking,
  IPitchDayAvailability,
  IPublicPitch,
} from '@pitchaside/shared';

/** A day on this phone's calendar as YYYY-MM-DD (toISOString would give the UTC day, a day early before 1am in Lagos). */
export function localYmd(d: Date) {
  return d.toLocaleDateString('en-CA');
}

/** The pitch code from what was pasted: the owner's whole link (…/p/CODE) or just the code. */
export function pitchCode(text: string): string | null {
  const t = text.trim();
  const fromLink = t.match(/\/p\/([a-z0-9]{6,16})(?:[/?#]|$)/i);
  if (fromLink) return fromLink[1].toLowerCase();
  return /^[a-z0-9]{6,16}$/i.test(t) ? t.toLowerCase() : null;
}

// ── Pitch management (pitch owner) ──

export function createPitch(data: {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  description?: string;
  slotDurationMinutes?: number;
  defaultPrice: number;
  currency?: string;
}) {
  return http.post<IPitch>('/pitches', data);
}

export function getMyPitches() {
  return http.get<IPitch[]>('/pitches');
}

export function getPitch(id: string) {
  return http.get<IPitch>(`/pitches/${id}`);
}

export function updatePitch(id: string, data: Partial<{
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  slotDurationMinutes: number;
  defaultPrice: number;
  currency: string;
  status: string;
  mapUrl: string | null;
  directions: string | null;
  aSide: number | null;
  surface: string | null;
  lengthM: number | null;
  widthM: number | null;
  facilities: string[];
}>) {
  return http.patch<IPitch>(`/pitches/${id}`, data);
}

/** Whether the pitch can go for good (never booked, no bank account of its own), or only be hidden. */
export function canDeletePitch(id: string) {
  return http.get<{ canDelete: boolean }>(`/pitches/${id}/can-delete`).then((r) => r.canDelete);
}

/** Gone for good; the server refuses, saying why, once it has bookings or its own account. */
export function deletePitchForGood(id: string) {
  return http.delete<{ deleted: boolean }>(`/pitches/${id}/forever`);
}

export function deactivatePitch(id: string) {
  return http.delete<IPitch>(`/pitches/${id}`);
}

// ── Photos ──

/** Where a pitch photo is served (public: anyone with the pitch link sees it). */
export function pitchPhotoUrl(key: string) {
  return `${BASE_URL}/pitch-photos/${key}`;
}

export function addPitchPhoto(pitchId: string, image: string) {
  return http.post<{ photoKeys: string[] }>(`/pitches/${pitchId}/photos`, { image });
}

export function removePitchPhoto(pitchId: string, key: string) {
  return http.delete<{ photoKeys: string[] }>(`/pitches/${pitchId}/photos/${key}`);
}

/** Makes this photo the cover (it moves to the front). */
export function coverPitchPhoto(pitchId: string, key: string) {
  return http.post<{ photoKeys: string[] }>(`/pitches/${pitchId}/photos/${key}/cover`, {});
}

// ── Schedule ──

export function setSchedule(pitchId: string, slots: {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  price?: number;
}[]) {
  return http.put<IPitchSchedule[]>(`/pitches/${pitchId}/schedule`, { slots });
}

export function getSchedule(pitchId: string) {
  return http.get<IPitchSchedule[]>(`/pitches/${pitchId}/schedule`);
}

// ── Overrides ──

export function addOverride(pitchId: string, data: {
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  price?: number;
  reason?: string;
}) {
  return http.post<IPitchSlotOverride>(`/pitches/${pitchId}/overrides`, data);
}

export function listOverrides(pitchId: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return http.get<IPitchSlotOverride[]>(`/pitches/${pitchId}/overrides${qs ? `?${qs}` : ''}`);
}

export function removeOverride(pitchId: string, overrideId: string) {
  return http.delete(`/pitches/${pitchId}/overrides/${overrideId}`);
}

// ── Bookings (pitch owner) ──

export function listBookings(pitchId: string) {
  return http.get<IPitchBooking[]>(`/pitches/${pitchId}/bookings`);
}

export function confirmBooking(pitchId: string, bookingId: string) {
  return http.post<IPitchBooking>(`/pitches/${pitchId}/bookings/${bookingId}/confirm`);
}

export function rejectBooking(pitchId: string, bookingId: string, reason?: string) {
  return http.post<IPitchBooking>(`/pitches/${pitchId}/bookings/${bookingId}/reject`, { reason });
}

export function cancelBookingOwner(pitchId: string, bookingId: string) {
  return http.post<IPitchBooking>(`/pitches/${pitchId}/bookings/${bookingId}/cancel`);
}

export function markBookingPaid(pitchId: string, bookingId: string) {
  return http.post<IPitchBooking>(`/pitches/${pitchId}/bookings/${bookingId}/mark-paid`);
}

// ── Bank ──

export function saveBankDetails(pitchId: string, data: {
  bankAccountNumber: string;
  bankCode: string;
  bankName: string;
  accountHolderName: string;
}) {
  return http.put<IPitch>(`/pitches/${pitchId}/bank`, data);
}

export function pitchNameEnquiry(pitchId: string, bankCode: string, accountNumber: string) {
  return http.post<{ accountName: string }>(`/pitches/${pitchId}/name-enquiry`, { bankCode, accountNumber });
}

// ── Virtual account / billing ──

export function createPitchAccount(pitchId: string) {
  return http.post<IPitch>(`/pitches/${pitchId}/account`);
}

export function getPitchBilling(pitchId: string) {
  return http.get<{
    accountNumber: string | null;
    accountName: string | null;
    virtualBankName: string | null;
    bankAccountNumber: string | null;
    bankCode: string | null;
    bankName: string | null;
    accountHolderName: string | null;
  }>(`/pitches/${pitchId}/billing`);
}

export function getPitchBalance(pitchId: string) {
  return http.get<{ totalIn: number; totalOut: number; available: number; bankBalance: number | null }>(`/pitches/${pitchId}/balance`);
}

export function listPitchTransfers(pitchId: string) {
  return http.get<any[]>(`/pitches/${pitchId}/transfers`);
}

export function listPitchPayouts(pitchId: string) {
  return http.get<any[]>(`/pitches/${pitchId}/payouts`);
}

export function withdrawFromPitch(pitchId: string, data: { amount: number; pin: string; narration?: string }) {
  return http.post<any>(`/pitches/${pitchId}/withdraw`, data);
}

export function assignPitchTransfer(pitchId: string, transferId: string, bookingId: string) {
  return http.post<any>(`/pitches/${pitchId}/transfers/${transferId}/assign`, { bookingId });
}

// ── Public ──

/** A pitch in the public list: ready to book, with where it is and the least a game costs. */
export interface DirectoryPitch {
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  aSide: number | null;
  surface: string | null;
  priceFrom: number;
  photoKey: string | null;
}

/** Every pitch ready to book on PitchAside (no sign-in needed). */
export function getPitchDirectory() {
  return http.get<DirectoryPitch[]>('/public/pitches');
}

export function getPublicPitch(code: string) {
  return http.get<IPublicPitch>(`/public/pitches/${code}`);
}

export function getPublicAvailability(code: string, from: string, to: string) {
  return http.get<{ pitch: IPublicPitch; days: IPitchDayAvailability[] }>(
    `/public/pitches/${code}/availability?from=${from}&to=${to}`,
  );
}

// ── Organiser bookings ──

export function createBooking(data: {
  pitchId: string;
  date: string;
  startTime: string;
  endTime: string;
  bookerName: string;
  bookerPhone?: string;
  groupId?: string;
  notes?: string;
}) {
  return http.post<IPitchBooking>('/bookings', data);
}

export function getMyBookings() {
  return http.get<IPitchBooking[]>('/bookings/mine');
}

export function cancelMyBooking(bookingId: string) {
  return http.post<IPitchBooking>(`/bookings/${bookingId}/cancel`);
}

export function payBooking(bookingId: string, groupId: string, pin: string) {
  return http.post<IPitchBooking>(`/bookings/${bookingId}/pay`, { groupId, pin });
}
