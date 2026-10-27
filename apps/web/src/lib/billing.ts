import { PaymentType, type GroupScope } from '@pitchaside/shared';

/** Currency symbol for a group's scope. */
export function currencySymbol(scope?: GroupScope | string): string {
  return scope === 'international' ? '$' : '₦';
}

/** Format an amount in the group's currency. */
export function formatGroupAmount(amount: number, scope?: GroupScope | string): string {
  if (scope === 'international') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

/** Display name for a chain id. */
export function chainName(chain: string): string {
  const names: Record<string, string> = {
    polygon: 'Polygon',
    base: 'Base',
    tron: 'Tron',
    ethereum: 'Ethereum',
    arbitrum: 'Arbitrum',
    bsc: 'BNB Chain',
    avalanche: 'Avalanche',
    optimism: 'Optimism',
    solana: 'Solana',
  };
  return names[chain] ?? chain;
}

export const frequencyOptions: { value: PaymentType; label: string; short: string; hint: string }[] = [
  { value: PaymentType.PER_SESSION, label: 'Per game', short: 'per game', hint: 'Each time you play' },
  { value: PaymentType.WEEKLY, label: 'Weekly', short: 'per week', hint: 'Dues every Monday' },
  { value: PaymentType.MONTHLY, label: 'Monthly', short: 'per month', hint: 'Dues on the 1st' },
  { value: PaymentType.QUARTERLY, label: 'Quarterly', short: 'per quarter', hint: 'Every 3 months' },
  { value: PaymentType.ANNUALLY, label: 'Annually', short: 'per year', hint: 'One season fee' },
];

export function frequencyShort(type: PaymentType | string) {
  return frequencyOptions.find((o) => o.value === type)?.short ?? '';
}

/** Group account numbers read better in 3-3-4 blocks: 866 109 0336. */
export function formatAccountNumber(n: string) {
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

export function paymentShareText(opts: {
  groupName: string;
  amount: string;
  frequency: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  link: string;
}) {
  return [
    `⚽ ${opts.groupName} — ${opts.amount} ${opts.frequency}`,
    ``,
    `Pay into:`,
    `${opts.bankName}`,
    `${opts.accountNumber}`,
    `${opts.accountName}`,
    ``,
    `Join the group & get your payment reference: ${opts.link}`,
  ].join('\n');
}
