'use client';

import { useEffect, useState } from 'react';
import { ConfirmSheet } from '@/components/match-day/confirm-sheet';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';
import {
  clearGroupPayee,
  formatCurrency,
  getGroupPayee,
  initiateGroupPayout,
  saveGroupPayee,
  type GroupPayee,
  type NigerianBank,
} from '@/lib/api';

const SERVICE_FEE = 350;

const input =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

const LABELS = ['Pitch owner', 'Facility manager'];

/** Search-as-you-type list of Nigerian banks. */
export function BankPicker({
  banks,
  value,
  onChange,
}: {
  banks: NigerianBank[];
  value: string;
  onChange: (code: string) => void;
}) {
  const [search, setSearch] = useState(() => banks.find((b) => b.code === value)?.name ?? '');
  const selected = banks.find((b) => b.code === value);
  const filtered = search && search !== selected?.name ? banks.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())) : banks;
  const open = !value || search !== selected?.name;

  return (
    <div>
      <input type="text" placeholder="Search banks…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${input} mb-1`} />
      {open && filtered.length > 0 && (
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
          {filtered.map((b) => (
            <button
              type="button"
              key={b.code}
              onClick={() => {
                onChange(b.code);
                setSearch(b.name);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-volt-300/20 transition-colors ${value === b.code ? 'bg-volt-300/30 font-bold' : ''}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PinInput({ value, onChange }: { value: string; onChange: (pin: string) => void }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      placeholder="Transfer PIN"
      aria-label="Transfer PIN"
      className={`${input} text-center tracking-[0.3em]`}
      autoComplete="off"
    />
  );
}

/** Save or change who the group pays. The API checks the name with the bank before saving. */
function PayeeForm({
  groupId,
  banks,
  current,
  onSaved,
  onCancel,
}: {
  groupId: string;
  banks: NigerianBank[];
  current: GroupPayee | null;
  onSaved: (p: GroupPayee) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState(current?.label ?? LABELS[0]);
  const [bankCode, setBankCode] = useState(current?.bankCode ?? '');
  const [account, setAccount] = useState(current?.accountNumber ?? '');
  const [amount, setAmount] = useState(current?.amount ? String(current.amount) : '');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveGroupPayee(groupId, {
        bankCode,
        accountNumber: account,
        label: label.trim() || LABELS[0],
        amount: Number(amount) || undefined,
      });
      toast.success(`Saved ${saved.name}`);
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the payee");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink">{current ? 'Change payee' : 'Who do you pay for the pitch?'}</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-ink">
          Cancel
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={label === l}
            onClick={() => setLabel(l)}
            className={`px-3 py-1.5 text-sm font-bold rounded-full border transition-colors ${
              label === l ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-700 border-gray-200 hover:border-ink'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Their bank</label>
        <BankPicker banks={banks} value={bankCode} onChange={setBankCode} />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">Account number</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          value={account}
          onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="0123456789"
          className={input}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 mb-1 block">
          Usual amount (₦) <span className="text-gray-500 font-medium">(optional)</span>
        </label>
        <input type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 30000" className={input} />
        <p className="text-[11px] text-gray-500 mt-1">Prefilled each time you pay them. You can still change it.</p>
      </div>

      <button
        type="submit"
        disabled={saving || !bankCode || account.length !== 10}
        className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <BallSpinner />}
        {saving ? 'Checking with the bank…' : 'Save'}
      </button>
    </form>
  );
}

/**
 * The group's pitch owner / facility manager: saved once, then paid in one tap
 * (amount prefilled, confirmed with the transfer PIN).
 */
export function PayeeCard({
  groupId,
  groupName,
  banks,
  available,
  onPaid,
}: {
  groupId: string;
  groupName: string;
  banks: NigerianBank[];
  available: number;
  onPaid: () => Promise<void>;
}) {
  const toast = useToast();
  const [payee, setPayee] = useState<GroupPayee | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    getGroupPayee(groupId)
      .then((p) => setPayee(p ?? null))
      .catch(() => setPayee(null));
  }, [groupId]);

  function startPaying() {
    setAmount(payee?.amount ? String(payee.amount) : '');
    setPin('');
    setPaying(true);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!payee) return;
    setSending(true);
    try {
      await initiateGroupPayout(groupId, {
        amount: Number(amount),
        toPayee: true,
        category: 'pitch',
        narration: `PitchAside ${groupName} – ${payee.label.toLowerCase()}`,
        pin,
      });
      toast.success(`Sending ${formatCurrency(Number(amount))} to ${payee.name}`);
      setPaying(false);
      await onPaid();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    try {
      await clearGroupPayee(groupId);
      setPayee(null);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the payee");
    }
  }

  if (payee === undefined) return null;

  if (editing || !payee) {
    return editing ? (
      <PayeeForm
        groupId={groupId}
        banks={banks}
        current={payee}
        onSaved={(p) => {
          setPayee(p);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    ) : (
      <button
        onClick={() => setEditing(true)}
        className="press w-full flex items-center gap-3 px-4 min-h-16 py-3 text-left hover:bg-chalk transition-colors"
      >
        <span className="w-10 h-10 rounded-xl bg-volt-300 text-ink flex items-center justify-center shrink-0" aria-hidden>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-ink leading-snug">Save your pitch owner</span>
          <span className="block text-xs text-gray-500 mt-0.5 truncate">Save them once, pay them in one tap.</span>
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    );
  }

  const tooMuch = Number(amount) + SERVICE_FEE > available;

  const initials = payee.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="px-4 py-3.5">
      <ConfirmSheet
        open={confirmRemove}
        title={`Remove ${payee.name}?`}
        message={`They come off this group’s ${payee.label.toLowerCase()}. Money already sent to them isn’t affected.`}
        confirmLabel="Remove"
        cancelLabel="Keep them"
        danger
        onConfirm={() => {
          setConfirmRemove(false);
          void remove();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
      {/* Who, then the one tap to pay them: the button on its own line so the details never get cut */}
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center font-display text-[14px] font-extrabold" aria-hidden>
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink truncate">{payee.name}</span>
          <span className="block text-[12px] text-gray-500 truncate">
            {payee.label} · {payee.bankName} ···{payee.accountNumber.slice(-4)}
          </span>
        </span>
      </div>
      {!paying && (
        <button onClick={startPaying} className="press mt-3 w-full min-h-12 rounded-2xl bg-volt-400 text-ink text-[15px] font-bold tabular-nums hover:bg-volt-300 transition-colors">
          Pay {payee.amount ? formatCurrency(payee.amount) : payee.name.split(' ')[0]}
        </button>
      )}

      {paying ? (
        <form onSubmit={pay} className="mt-3 space-y-2.5">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Amount (₦)</label>
            <input type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={input} autoFocus />
            {tooMuch && <p className="text-xs text-kit-600 mt-1">More than the {formatCurrency(Math.max(0, available - SERVICE_FEE))} available after the {formatCurrency(SERVICE_FEE)} service fee.</p>}
            {Number(amount) > 0 && !tooMuch && (
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(SERVICE_FEE)} service fee applies</p>
            )}
          </div>
          <PinInput value={pin} onChange={setPin} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaying(false)}
              className="px-4 py-3 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !Number(amount) || tooMuch || pin.length < 4}
              className="flex-1 py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending && <BallSpinner />}
              {sending ? 'Sending…' : `Send ${Number(amount) ? `${formatCurrency(Number(amount))} + ${formatCurrency(SERVICE_FEE)} fee` : ''} to ${payee.name.split(' ')[0]}`}
            </button>
          </div>
        </form>
      ) : (
        // Looking after the saved details: quiet, out of the way of paying
        <div className="mt-1 flex items-center justify-center gap-5">
          <button onClick={() => setEditing(true)} className="min-h-9 text-[12px] font-bold text-pitch-700 hover:text-ink">
            Change details
          </button>
          <button onClick={() => setConfirmRemove(true)} className="min-h-9 text-[12px] font-bold text-gray-500 hover:text-kit-600">
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
