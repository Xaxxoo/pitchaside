/**
 * Payrep Microfinance Bank integration boundary.
 *
 * Everything the app needs from PulseMFB goes through this interface so the
 * real HTTP client can be dropped in without touching billing logic. Until
 * the API contract is confirmed we run the MockPulseClient (PULSE_MODE=mock).
 */

export const PULSE_CLIENT = Symbol('PULSE_CLIENT');

export interface CreateAccountInput {
  /** Our stable reference for the account owner (the group id). */
  reference: string;
  /** Name the account should carry, e.g. "PitchAside – Tuesday Night 5s". */
  accountName: string;
  /** Organisation contact, if the provider requires KYC-lite details. */
  email?: string;
  /** Phone number for KYC (PulseMFB requires this). */
  phone?: string;
  /** BVN for KYC (PulseMFB requires this). */
  bvn?: string;
  /** NIN for KYC, sent when the organiser gave a NIN and no BVN. */
  nin?: string;
}

export interface ProvisionedAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
  /** Provider's own id for the account. */
  providerReference: string;
}

/** A credit into one of our accounts, normalised from the provider's webhook. */
export interface IncomingTransfer {
  providerTransactionId: string;
  accountNumber: string;
  amount: number;
  senderName?: string;
  senderAccount?: string;
  senderBank?: string;
  narration?: string;
  receivedAt: Date;
  raw: unknown;
}

export interface TransferOutInput {
  /** The group's PulseMFB virtual account number. */
  debitAccountNumber: string;
  beneficiaryAccountNumber: string;
  beneficiaryBankCode: string;
  beneficiaryBankName: string;
  beneficiaryName: string;
  amount: number;
  narration?: string;
  /** Our unique reference for idempotency. */
  reference: string;
}

export interface TransferOutResult {
  reference: string;
  status: string;
}

export interface NameEnquiryResult {
  accountName: string;
}

export interface TransferStatusResult {
  status: string;
  errorMessage?: string;
}

export interface PulseClient {
  readonly mode: 'mock' | 'live';
  createAccount(input: CreateAccountInput): Promise<ProvisionedAccount>;
  /** Returns true when the webhook signature is valid for the raw body. */
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
  /** Re-reads the webhook secret from the provider, where it can; true when one is known. */
  refreshWebhookSecret?(): Promise<boolean>;
  /** Maps the provider's webhook payload to our shape; null if it isn't a credit. */
  parseWebhook(payload: unknown): IncomingTransfer | null;
  /** Verify a recipient's account name via NIBSS. */
  nameEnquiry(bankCode: string, accountNumber: string): Promise<NameEnquiryResult>;
  /** Initiate an outbound transfer from a group's virtual account. */
  transferOut(input: TransferOutInput): Promise<TransferOutResult>;
  /** Look up the status of an outbound transfer by our reference. */
  getTransfer(reference: string): Promise<TransferStatusResult>;
  /** What the bank itself holds in an account, in naira; null when there's no real bank (mock). */
  getBalance(accountNumber: string): Promise<number | null>;
  /** Asks the provider to deliver again every recent webhook that didn't get through. */
  resendFailedWebhooks?(): Promise<{ resent: number; failed: number }>;
}
