'use client';

import { PaymentStatus } from '@pitchaside/shared';
import { formatCurrency } from '@/lib/api';
import { kitFor } from '@/components/illustrations';
import { BallSpinner } from '@/components/skeleton';

interface PlayerPaymentRowProps {
  playerName: string;
  amount: number;
  status: PaymentStatus;
  onMarkPaid: () => void;
  onWaive?: () => void;
  loading?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** Paid by bank transfer into the group account (auto-matched). */
  viaTransfer?: boolean;
}

const statusConfig = {
  [PaymentStatus.PAID]: {
    label: 'Paid',
    badge: 'bg-volt-300 text-ink',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    ),
  },
  [PaymentStatus.PENDING]: {
    label: 'Pending',
    badge: 'bg-sun-400/25 text-amber-800',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  [PaymentStatus.WAIVED]: {
    label: 'Waived',
    badge: 'bg-gray-100 text-gray-500',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    ),
  },
};

export function PlayerPaymentRow({
  playerName,
  amount,
  status,
  onMarkPaid,
  onWaive,
  loading,
  selected,
  onToggle,
  viaTransfer,
}: PlayerPaymentRowProps) {
  const config = statusConfig[status];
  const canAct = status === PaymentStatus.PENDING;
  const kit = kitFor(playerName);

  return (
    <div
      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
        selected
          ? 'border-pitch-400 bg-volt-100 ring-2 ring-volt-300/60'
          : canAct
            ? 'border-gray-100 bg-white hover:border-gray-300 shadow-card'
            : 'border-transparent bg-white/60'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {onToggle !== undefined && canAct && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 rounded border-gray-300 text-pitch-600 focus:ring-pitch-500 shrink-0"
          />
        )}
        <div className={`w-9 h-9 rounded-full ${kit.bg} ${kit.fg} flex items-center justify-center text-sm font-extrabold font-display shrink-0`}>
          {playerName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink leading-snug break-words">{playerName}</p>
          <p className="text-xs text-gray-500 tabular-nums">
            {formatCurrency(amount)}
            {viaTransfer && status === PaymentStatus.PAID && (
              <span className="ml-1.5 text-[10px] font-bold text-pitch-600">· via bank transfer</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {loading ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-pitch-600">
            <BallSpinner className="w-4 h-4" />
          </span>
        ) : canAct ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onMarkPaid}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-volt-300 bg-ink rounded-lg hover:bg-pitch-900 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Mark paid
            </button>
            {onWaive && (
              <button
                onClick={onWaive}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Waive
              </button>
            )}
          </div>
        ) : (
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide ${config.badge}`}>
            {config.icon}
            {config.label}
          </span>
        )}
      </div>
    </div>
  );
}
