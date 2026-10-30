'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPitch, updatePitch, setSchedule, getSchedule, addOverride, listOverrides, removeOverride,
  saveBankDetails, pitchNameEnquiry, deactivatePitch,
  createPitchAccount, getPitchBalance, listPitchTransfers, listPitchPayouts, withdrawFromPitch,
} from '@/lib/pitch';
import { useToast } from '@/components/toast';
import { useSearchParams } from 'next/navigation';
import type { IPitch, IPitchSchedule, IPitchSlotOverride } from '@pitchaside/shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ScheduleRow { dayOfWeek: number; openTime: string; closeTime: string; price: string; }

export default function PitchSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') as any;
  const [pitch, setPitch] = useState<IPitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'general' | 'schedule' | 'overrides' | 'bank' | 'account'>(
    ['general', 'schedule', 'overrides', 'bank', 'account'].includes(initialTab) ? initialTab : 'general',
  );

  // General form
  const [general, setGeneral] = useState({ name: '', address: '', city: '', state: '', description: '', defaultPrice: '', slotDurationMinutes: '60' });
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Schedule
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Overrides
  const [overrides, setOverrides] = useState<IPitchSlotOverride[]>([]);
  const [ovrForm, setOvrForm] = useState({ date: '', startTime: '', endTime: '', type: 'blocked', price: '', reason: '' });
  const [savingOvr, setSavingOvr] = useState(false);

  // Bank
  const [bank, setBank] = useState({ bankAccountNumber: '', bankCode: '', bankName: '', accountHolderName: '' });
  const [savingBank, setSavingBank] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Account (virtual account)
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [balance, setBalance] = useState<{ totalIn: number; totalOut: number; available: number } | null>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', pin: '', narration: '' });
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, o] = await Promise.all([getPitch(id), getSchedule(id), listOverrides(id)]);
      setPitch(p);
      setGeneral({
        name: p.name,
        address: p.address || '',
        city: p.city || '',
        state: p.state || '',
        description: p.description || '',
        defaultPrice: String(Number(p.defaultPrice)),
        slotDurationMinutes: String(p.slotDurationMinutes),
      });
      setScheduleRows(s.map((r) => ({ dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime, price: r.price != null ? String(Number(r.price)) : '' })));
      setOverrides(o);
      setBank({
        bankAccountNumber: p.bankAccountNumber || '',
        bankCode: p.bankCode || '',
        bankName: p.bankName || '',
        accountHolderName: p.accountHolderName || '',
      });
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load account tab data when switching to it
  useEffect(() => {
    if (tab !== 'account' || !pitch?.accountNumber) return;
    getPitchBalance(id).then(setBalance).catch(() => {});
    listPitchTransfers(id).then(setTransfers).catch(() => {});
    listPitchPayouts(id).then(setPayouts).catch(() => {});
  }, [tab, id, pitch?.accountNumber]);

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await updatePitch(id, {
        name: general.name,
        address: general.address || undefined,
        city: general.city || undefined,
        state: general.state || undefined,
        description: general.description || undefined,
        defaultPrice: Number(general.defaultPrice),
        slotDurationMinutes: Number(general.slotDurationMinutes),
      });
      toast.success('Pitch updated');
    } catch (err: any) { toast.error(err.message); } finally { setSavingGeneral(false); }
  }

  async function saveScheduleHandler(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      await setSchedule(id, scheduleRows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        openTime: r.openTime,
        closeTime: r.closeTime,
        price: r.price ? Number(r.price) : undefined,
      })));
      toast.success('Schedule saved');
    } catch (err: any) { toast.error(err.message); } finally { setSavingSchedule(false); }
  }

  function addScheduleRow() {
    setScheduleRows([...scheduleRows, { dayOfWeek: 1, openTime: '08:00', closeTime: '22:00', price: '' }]);
  }

  function removeScheduleRow(i: number) {
    setScheduleRows(scheduleRows.filter((_, idx) => idx !== i));
  }

  function updateScheduleRow(i: number, field: keyof ScheduleRow, value: string) {
    const rows = [...scheduleRows];
    (rows[i] as any)[field] = field === 'dayOfWeek' ? Number(value) : value;
    setScheduleRows(rows);
  }

  async function addOvrHandler(e: React.FormEvent) {
    e.preventDefault();
    setSavingOvr(true);
    try {
      await addOverride(id, {
        date: ovrForm.date,
        startTime: ovrForm.startTime,
        endTime: ovrForm.endTime,
        type: ovrForm.type,
        price: ovrForm.price ? Number(ovrForm.price) : undefined,
        reason: ovrForm.reason || undefined,
      });
      toast.success('Override added');
      setOvrForm({ date: '', startTime: '', endTime: '', type: 'blocked', price: '', reason: '' });
      load();
    } catch (err: any) { toast.error(err.message); } finally { setSavingOvr(false); }
  }

  async function deleteOvr(ovrId: string) {
    try {
      await removeOverride(id, ovrId);
      toast.success('Override removed');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function saveBankHandler(e: React.FormEvent) {
    e.preventDefault();
    setSavingBank(true);
    try {
      await saveBankDetails(id, bank);
      toast.success('Bank details saved');
    } catch (err: any) { toast.error(err.message); } finally { setSavingBank(false); }
  }

  async function lookupName() {
    if (!bank.bankCode || !bank.bankAccountNumber) return;
    setLookingUp(true);
    try {
      const res = await pitchNameEnquiry(id, bank.bankCode, bank.bankAccountNumber);
      setBank({ ...bank, accountHolderName: res.accountName });
      toast.success('Name verified');
    } catch (err: any) { toast.error(err.message); } finally { setLookingUp(false); }
  }

  async function handleCreateAccount() {
    setCreatingAccount(true);
    try {
      const updated = await createPitchAccount(id);
      setPitch(updated);
      toast.success('Collection account created');
    } catch (err: any) { toast.error(err.message); } finally { setCreatingAccount(false); }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawing(true);
    try {
      await withdrawFromPitch(id, {
        amount: Number(withdrawForm.amount),
        pin: withdrawForm.pin,
        narration: withdrawForm.narration || undefined,
      });
      toast.success('Withdrawal initiated');
      setWithdrawForm({ amount: '', pin: '', narration: '' });
      // Refresh balance and payouts
      getPitchBalance(id).then(setBalance).catch(() => {});
      listPitchPayouts(id).then(setPayouts).catch(() => {});
    } catch (err: any) { toast.error(err.message); } finally { setWithdrawing(false); }
  }

  async function handleDeactivate() {
    if (!confirm('Deactivate this pitch? It will no longer be bookable.')) return;
    try {
      await deactivatePitch(id);
      toast.success('Pitch deactivated');
      router.push('/pitch-owner/pitches');
    } catch (err: any) { toast.error(err.message); }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (!pitch) return <div className="text-center py-20 text-gray-500">Pitch not found</div>;

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold text-ink mb-1">{pitch.name} &mdash; Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Manage pitch details, schedule, bank, and overrides.</p>

      <div className="flex gap-1 mb-6 border-b border-gray-100 overflow-x-auto">
        {(['general', 'schedule', 'overrides', 'bank', 'account'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors whitespace-nowrap ${tab === t ? 'text-ink border-b-2 border-ink' : 'text-gray-400 hover:text-gray-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* General */}
      {tab === 'general' && (
        <form onSubmit={saveGeneral} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Name *</label>
            <input required value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Address</label>
            <input value={general.address} onChange={(e) => setGeneral({ ...general, address: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">City</label>
              <input value={general.city} onChange={(e) => setGeneral({ ...general, city: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">State</label>
              <input value={general.state} onChange={(e) => setGeneral({ ...general, state: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
            <textarea rows={3} value={general.description} onChange={(e) => setGeneral({ ...general, description: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Default price</label>
              <input type="number" min={0} step="0.01" value={general.defaultPrice} onChange={(e) => setGeneral({ ...general, defaultPrice: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Slot duration</label>
              <select value={general.slotDurationMinutes} onChange={(e) => setGeneral({ ...general, slotDurationMinutes: e.target.value })} className={inputClass}>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
                <option value="120">120 min</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={savingGeneral} className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
            {savingGeneral ? 'Saving...' : 'Save'}
          </button>
          <div className="pt-6 border-t border-gray-100">
            <button type="button" onClick={handleDeactivate} className="text-sm text-red-600 font-bold hover:text-red-700">
              Deactivate pitch
            </button>
          </div>
        </form>
      )}

      {/* Schedule */}
      {tab === 'schedule' && (
        <form onSubmit={saveScheduleHandler} className="space-y-4">
          <p className="text-xs text-gray-500">Set your weekly recurring availability. One row per day window.</p>
          {scheduleRows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-1">Day</label>
                <select value={row.dayOfWeek} onChange={(e) => updateScheduleRow(i, 'dayOfWeek', e.target.value)} className={inputClass}>
                  {DAYS.map((d, di) => <option key={di} value={di}>{d}</option>)}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-700 mb-1">Open</label>
                <input type="time" value={row.openTime} onChange={(e) => updateScheduleRow(i, 'openTime', e.target.value)} className={inputClass} />
              </div>
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-700 mb-1">Close</label>
                <input type="time" value={row.closeTime} onChange={(e) => updateScheduleRow(i, 'closeTime', e.target.value)} className={inputClass} />
              </div>
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-700 mb-1">Price</label>
                <input type="number" min={0} step="0.01" placeholder="default" value={row.price} onChange={(e) => updateScheduleRow(i, 'price', e.target.value)} className={inputClass} />
              </div>
              <button type="button" onClick={() => removeScheduleRow(i)} className="text-red-500 hover:text-red-700 pb-3 text-lg font-bold">&times;</button>
            </div>
          ))}
          <button type="button" onClick={addScheduleRow} className="text-sm text-pitch-600 font-bold">+ Add time window</button>
          <div>
            <button type="submit" disabled={savingSchedule} className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
              {savingSchedule ? 'Saving...' : 'Save schedule'}
            </button>
          </div>
        </form>
      )}

      {/* Overrides */}
      {tab === 'overrides' && (
        <div className="space-y-6">
          <form onSubmit={addOvrHandler} className="space-y-3 bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-gray-700">Add a date override</p>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" required value={ovrForm.date} onChange={(e) => setOvrForm({ ...ovrForm, date: e.target.value })} className={inputClass} />
              <select value={ovrForm.type} onChange={(e) => setOvrForm({ ...ovrForm, type: e.target.value })} className={inputClass}>
                <option value="blocked">Block slots</option>
                <option value="added">Add extra slots</option>
                <option value="price_override">Price override</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="time" required value={ovrForm.startTime} onChange={(e) => setOvrForm({ ...ovrForm, startTime: e.target.value })} className={inputClass} placeholder="Start" />
              <input type="time" required value={ovrForm.endTime} onChange={(e) => setOvrForm({ ...ovrForm, endTime: e.target.value })} className={inputClass} placeholder="End" />
            </div>
            {(ovrForm.type === 'added' || ovrForm.type === 'price_override') && (
              <input type="number" min={0} step="0.01" placeholder="Price" value={ovrForm.price} onChange={(e) => setOvrForm({ ...ovrForm, price: e.target.value })} className={inputClass} />
            )}
            <input placeholder="Reason (optional)" value={ovrForm.reason} onChange={(e) => setOvrForm({ ...ovrForm, reason: e.target.value })} className={inputClass} />
            <button type="submit" disabled={savingOvr} className="px-4 py-2 bg-ink text-volt-300 text-sm font-bold rounded-xl disabled:opacity-50">
              {savingOvr ? 'Adding...' : 'Add override'}
            </button>
          </form>

          {overrides.length > 0 && (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div>
                    <span className="text-sm font-semibold text-ink">{o.date}</span>
                    <span className="text-xs text-gray-500 ml-2">{o.startTime} - {o.endTime}</span>
                    <span className={`text-xs font-bold ml-2 ${o.type === 'blocked' ? 'text-red-600' : o.type === 'added' ? 'text-green-600' : 'text-blue-600'}`}>
                      {o.type.replace('_', ' ')}
                    </span>
                    {o.reason && <span className="text-xs text-gray-400 ml-2">{o.reason}</span>}
                  </div>
                  <button onClick={() => deleteOvr(o.id)} className="text-xs text-red-500 font-bold hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account (virtual account) */}
      {tab === 'account' && (
        <div className="space-y-6">
          {!pitch.accountNumber ? (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <h3 className="text-sm font-bold text-ink mb-2">Collection account</h3>
              <p className="text-xs text-gray-500 mb-4">
                Create a virtual account so bookers can pay directly via bank transfer.
                You&apos;ll need BVN or NIN set up in your account settings.
              </p>
              <button
                onClick={handleCreateAccount}
                disabled={creatingAccount}
                className="px-5 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
              >
                {creatingAccount ? 'Creating...' : 'Create collection account'}
              </button>
            </div>
          ) : (
            <>
              {/* Account details */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-bold text-gray-500 mb-3">Collection account</h3>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Account number</p>
                      <p className="text-sm font-mono font-bold text-ink">{pitch.accountNumber}</p>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(pitch.accountNumber!); toast.success('Copied'); }}
                      className="text-xs font-bold text-pitch-600 hover:text-pitch-700"
                    >
                      Copy
                    </button>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bank</p>
                    <p className="text-sm font-semibold text-ink">{pitch.virtualBankName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Account name</p>
                    <p className="text-sm font-semibold text-ink">{pitch.accountName}</p>
                  </div>
                </div>
              </div>

              {/* Balance */}
              {balance && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                    <p className="text-xs text-gray-500">Total in</p>
                    <p className="text-sm font-bold text-ink">{Number(balance.totalIn).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                    <p className="text-xs text-gray-500">Total out</p>
                    <p className="text-sm font-bold text-ink">{Number(balance.totalOut).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 p-3 text-center">
                    <p className="text-xs text-gray-500">Available</p>
                    <p className="text-sm font-bold text-green-700">{Number(balance.available).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {/* Withdraw */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h3 className="text-xs font-bold text-gray-500 mb-3">Withdraw to your bank</h3>
                {(!pitch.bankAccountNumber || !pitch.bankCode) ? (
                  <p className="text-xs text-gray-500">Set your personal bank details in the Bank tab first.</p>
                ) : (
                  <form onSubmit={handleWithdraw} className="space-y-3">
                    <p className="text-xs text-gray-400">
                      To: {pitch.accountHolderName} &middot; {pitch.bankAccountNumber} &middot; {pitch.bankName}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" required min={1} placeholder="Amount" value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} className={inputClass} />
                      <input type="password" required maxLength={6} placeholder="PIN" value={withdrawForm.pin} onChange={(e) => setWithdrawForm({ ...withdrawForm, pin: e.target.value })} className={inputClass} />
                    </div>
                    <input placeholder="Narration (optional)" value={withdrawForm.narration} onChange={(e) => setWithdrawForm({ ...withdrawForm, narration: e.target.value })} className={inputClass} />
                    <button type="submit" disabled={withdrawing} className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
                      {withdrawing ? 'Withdrawing...' : 'Withdraw'}
                    </button>
                    <p className="text-[11px] text-gray-400">A service fee of NGN 350 applies per withdrawal.</p>
                  </form>
                )}
              </div>

              {/* Recent transfers */}
              {transfers.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-2">Recent transfers in</h3>
                  <div className="space-y-1.5">
                    {transfers.slice(0, 10).map((t: any) => (
                      <div key={t.id} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-ink">NGN {Number(t.amount).toLocaleString()}</span>
                          {t.senderName && <span className="text-xs text-gray-400 ml-2">{t.senderName}</span>}
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t.status === 'matched' || t.status === 'assigned' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent payouts */}
              {payouts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-2">Recent withdrawals</h3>
                  <div className="space-y-1.5">
                    {payouts.slice(0, 10).map((p: any) => (
                      <div key={p.id} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-ink">NGN {Number(p.amount).toLocaleString()}</span>
                          <span className="text-xs text-gray-400 ml-2">{p.beneficiaryBankName}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          p.status === 'completed' ? 'bg-green-100 text-green-700'
                          : p.status === 'failed' ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bank */}
      {tab === 'bank' && (
        <form onSubmit={saveBankHandler} className="space-y-4">
          <p className="text-xs text-gray-500">Set your bank account to receive on-platform payments from organisers.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Bank code</label>
              <input required value={bank.bankCode} onChange={(e) => setBank({ ...bank, bankCode: e.target.value })} className={inputClass} placeholder="e.g. 058" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Account number</label>
              <input required maxLength={10} value={bank.bankAccountNumber} onChange={(e) => setBank({ ...bank, bankAccountNumber: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Account holder name</label>
              <input required value={bank.accountHolderName} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} className={inputClass} />
            </div>
            <button type="button" onClick={lookupName} disabled={lookingUp} className="px-3 py-3 text-xs font-bold text-pitch-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">
              {lookingUp ? 'Checking...' : 'Verify'}
            </button>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Bank name</label>
            <input required value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} className={inputClass} />
          </div>
          <button type="submit" disabled={savingBank} className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
            {savingBank ? 'Saving...' : 'Save bank details'}
          </button>
        </form>
      )}
    </div>
  );
}
