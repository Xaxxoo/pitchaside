import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Group } from '../groups/entities/group.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Player } from '../players/entities/player.entity';
import { PaymentsService } from '../payments/payments.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { GroupWallet } from './entities/group-wallet.entity';
import { UserWallet } from './entities/user-wallet.entity';
import { CryptoTransfer, CryptoTransferStatus } from './entities/crypto-transfer.entity';
import { CryptoOutgoingTransfer, CryptoPayoutStatus } from './entities/crypto-outgoing-transfer.entity';
import { WalletDerivationCounter } from './entities/wallet-derivation-counter.entity';
import type { CryptoClient } from './crypto-client';
import { EvmClient } from './chains/evm.client';
import { TronClient } from './chains/tron.client';
import { CHAINS, chainsForFamily, phase1Families, supportedTokens } from './chains/chain-registry';
import { MonitorService } from './monitoring/monitor.service';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly clients: Map<string, CryptoClient> = new Map();
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(GroupWallet) private walletRepo: Repository<GroupWallet>,
    @InjectRepository(UserWallet) private userWalletRepo: Repository<UserWallet>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(CryptoTransfer) private transferRepo: Repository<CryptoTransfer>,
    @InjectRepository(CryptoOutgoingTransfer) private outgoingRepo: Repository<CryptoOutgoingTransfer>,
    @InjectRepository(WalletDerivationCounter) private counterRepo: Repository<WalletDerivationCounter>,
    @InjectRepository(GroupMembership) private membershipRepo: Repository<GroupMembership>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Player) private playerRepo: Repository<Player>,
    private readonly payments: PaymentsService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
    private readonly monitor: MonitorService,
    private readonly manager: EntityManager,
  ) {
    this.enabled = config.get('CRYPTO_ENABLED', 'false') === 'true';

    if (this.enabled) {
      this.initClients();
    }
  }

  private initClients() {
    const masterSeed = this.decryptSeed();
    if (!masterSeed) {
      this.logger.warn('CRYPTO_MASTER_SEED not set; crypto wallets will not work');
      return;
    }

    const rpcOverrides: Record<string, string> = {};
    for (const [, chain] of Object.entries(CHAINS)) {
      if (chain.rpcEnvKey) {
        const override = this.config.get(chain.rpcEnvKey);
        if (override) rpcOverrides[chain.rpcEnvKey] = override;
      }
    }

    // EVM client
    const alchemySecret = this.config.get('ALCHEMY_WEBHOOK_SECRET', '');
    this.clients.set('evm', new EvmClient(masterSeed, alchemySecret, rpcOverrides));

    // Tron client
    const tronGridKey = this.config.get('TRONGRID_API_KEY', '');
    const tronWebhookSecret = this.config.get('TRONGRID_WEBHOOK_SECRET', '');
    this.clients.set('tron', new TronClient(masterSeed, tronWebhookSecret, tronGridKey));
  }

  /**
   * Decrypt the master seed from the environment.
   * In production, CRYPTO_MASTER_SEED is encrypted with AES-256-GCM using CRYPTO_SEED_ENCRYPTION_KEY.
   * In development, it can be a raw hex seed.
   */
  private decryptSeed(): string | null {
    const raw = this.config.get('CRYPTO_MASTER_SEED');
    if (!raw) return null;

    const encKey = this.config.get('CRYPTO_SEED_ENCRYPTION_KEY');
    if (!encKey) {
      // Development mode: raw hex seed
      return raw;
    }

    try {
      // Encrypted format: iv:authTag:ciphertext (all hex)
      const [ivHex, authTagHex, ciphertextHex] = raw.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');
      const key = Buffer.from(encKey, 'hex');

      const crypto = require('crypto');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('hex');
    } catch (err) {
      this.logger.error(`Failed to decrypt master seed: ${err}`);
      return null;
    }
  }

  private getClient(family: string): CryptoClient {
    const client = this.clients.get(family);
    if (!client) throw new BadRequestException(`Chain family '${family}' is not enabled`);
    return client;
  }

  // ── Wallet provisioning ──

  /**
   * Provision wallets for an international group.
   * Called when a group with scope='international' is created.
   */
  async provisionWallets(group: Group): Promise<GroupWallet[]> {
    if (!this.enabled) {
      this.logger.warn('Crypto not enabled; skipping wallet provisioning');
      return [];
    }

    const families = phase1Families();
    const wallets: GroupWallet[] = [];

    for (const family of families) {
      const client = this.clients.get(family);
      if (!client) continue;

      // Atomically claim the next derivation index
      const index = await this.manager.transaction(async (em) => {
        const counter = await em.findOne(WalletDerivationCounter, {
          where: { chainFamily: family },
          lock: { mode: 'pessimistic_write' },
        });
        if (!counter) throw new Error(`No derivation counter for ${family}`);
        const idx = counter.nextIndex;
        counter.nextIndex = idx + 1;
        await em.save(counter);
        return idx;
      });

      const { address } = client.deriveAddress(index);

      const wallet = this.walletRepo.create({
        groupId: group.id,
        chainFamily: family,
        address,
        derivationIndex: index,
      });
      wallets.push(await this.walletRepo.save(wallet));
    }

    this.logger.log(`Provisioned ${wallets.length} wallet(s) for group ${group.id}`);
    return wallets;
  }

  // ── Per-user wallet provisioning ──

  /**
   * Provision wallets for a user (one per chain family).
   * Called on signup so every admin has addresses ready.
   */
  async provisionUserWallets(user: { id: string }): Promise<UserWallet[]> {
    if (!this.enabled) {
      this.logger.warn('Crypto not enabled; skipping user wallet provisioning');
      return [];
    }

    const families = phase1Families();
    const wallets: UserWallet[] = [];

    for (const family of families) {
      const client = this.clients.get(family);
      if (!client) continue;

      // Skip if the user already has a wallet for this family
      const existing = await this.userWalletRepo.findOne({
        where: { userId: user.id, chainFamily: family },
      });
      if (existing) {
        wallets.push(existing);
        continue;
      }

      // Atomically claim the next derivation index
      const index = await this.manager.transaction(async (em) => {
        const counter = await em.findOne(WalletDerivationCounter, {
          where: { chainFamily: family },
          lock: { mode: 'pessimistic_write' },
        });
        if (!counter) throw new Error(`No derivation counter for ${family}`);
        const idx = counter.nextIndex;
        counter.nextIndex = idx + 1;
        await em.save(counter);
        return idx;
      });

      const { address } = client.deriveAddress(index);

      const wallet = this.userWalletRepo.create({
        userId: user.id,
        chainFamily: family,
        address,
        derivationIndex: index,
      });
      wallets.push(await this.userWalletRepo.save(wallet));
    }

    this.logger.log(`Provisioned ${wallets.length} user wallet(s) for user ${user.id}`);
    return wallets;
  }

  // ── Wallet queries ──

  /**
   * Return the authenticated user's wallet addresses.
   */
  async getUserWallets(userId: string) {
    const wallets = await this.userWalletRepo.find({ where: { userId } });
    return wallets.map((w) => ({
      chainFamily: w.chainFamily,
      address: w.address,
      chains: chainsForFamily(w.chainFamily),
    }));
  }

  /**
   * Get wallet addresses for a group.
   * Instead of group_wallets, returns the org admin's user wallets.
   */
  async getGroupWallets(groupId: string, organizationId: string) {
    await this.ensureGroup(groupId, organizationId);

    // Find the ORG_ADMIN for this organization
    const admin = await this.userRepo.findOne({
      where: { organizationId, role: UserRole.ORG_ADMIN },
    });

    if (admin) {
      const userWallets = await this.userWalletRepo.find({ where: { userId: admin.id } });
      if (userWallets.length > 0) {
        return userWallets.map((w) => ({
          chainFamily: w.chainFamily,
          address: w.address,
          chains: chainsForFamily(w.chainFamily),
        }));
      }
    }

    // Fallback: legacy group_wallets for groups provisioned before the migration
    const wallets = await this.walletRepo.find({ where: { groupId } });
    return wallets.map((w) => ({
      chainFamily: w.chainFamily,
      address: w.address,
      chains: chainsForFamily(w.chainFamily),
    }));
  }

  // ── Incoming transfers ──

  /**
   * Handle a webhook from a chain monitoring service.
   * Verifies the signature, parses the payload, and records the transfer.
   */
  async handleIncomingTransfer(
    chain: string,
    rawBody: string,
    signature: string,
    payload: unknown,
  ): Promise<CryptoTransfer | null> {
    const chainConfig = CHAINS[chain];
    if (!chainConfig) {
      this.logger.warn(`Unknown chain: ${chain}`);
      return null;
    }

    const client = this.clients.get(chainConfig.family);
    if (!client) return null;

    // Verify webhook signature (skip in development if no secret is set)
    if (signature && !client.verifyWebhook(rawBody, signature)) {
      this.logger.warn(`Invalid webhook signature for ${chain}`);
      return null;
    }

    const transfer = client.parseWebhook(chain, payload);
    if (!transfer) return null;

    return this.monitor.processIncoming(transfer);
  }

  async listTransfers(groupId: string, organizationId: string): Promise<CryptoTransfer[]> {
    await this.ensureGroup(groupId, organizationId);

    return this.transferRepo.find({
      where: { groupId },
      relations: ['player', 'payment', 'payment.player'],
      order: { receivedAt: 'DESC' },
    });
  }

  // ── Transfer matching & assignment ──

  async assignTransfer(transferId: string, paymentId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== CryptoTransferStatus.UNMATCHED) {
      throw new BadRequestException('Transfer is already matched or assigned');
    }

    // The payment id comes from the request: it has to be a due in one of this club's games.
    const payment = await this.paymentRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .innerJoin('session.group', 'group')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found');

    // Claim the transfer only while it's still unmatched, so two assigns can't both use it.
    const claimed = await this.transferRepo.update(
      { id: transfer.id, status: CryptoTransferStatus.UNMATCHED },
      { paymentId, playerId: payment.playerId, status: CryptoTransferStatus.ASSIGNED },
    );
    if (!claimed.affected) throw new BadRequestException('Transfer is already matched or assigned');

    await this.payments.markAsPaid(paymentId, organizationId, 'crypto');
    return this.findTransfer(transfer.id, organizationId);
  }

  async giveTransfer(transferId: string, playerId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== CryptoTransferStatus.UNMATCHED) {
      throw new BadRequestException('Transfer is already matched or assigned');
    }

    // The player id comes from the request: it has to be a member of the group the money came to.
    const member = transfer.groupId && (await this.membershipRepo.findOne({ where: { groupId: transfer.groupId, playerId } }));
    if (!member) throw new NotFoundException("That player isn't in this group");

    const claimed = await this.transferRepo.update(
      { id: transfer.id, status: CryptoTransferStatus.UNMATCHED },
      { playerId, status: CryptoTransferStatus.ASSIGNED },
    );
    if (!claimed.affected) throw new BadRequestException('Transfer is already matched or assigned');
    return this.findTransfer(transfer.id, organizationId);
  }

  async ignoreTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    transfer.status = CryptoTransferStatus.IGNORED;
    return this.transferRepo.save(transfer);
  }

  async restoreTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    transfer.status = CryptoTransferStatus.UNMATCHED;
    transfer.playerId = null;
    transfer.paymentId = null as any;
    return this.transferRepo.save(transfer);
  }

  // ── Balance ──

  async getGroupBalance(groupId: string, organizationId: string) {
    await this.ensureGroup(groupId, organizationId);

    const incoming = await this.transferRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.group_id = :groupId', { groupId })
      .andWhere('t.status != :ignored', { ignored: CryptoTransferStatus.IGNORED })
      .getRawOne();

    const outgoing = await this.outgoingRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.amount + o.fee), 0)', 'total')
      .where('o.group_id = :groupId', { groupId })
      .andWhere('o.status IN (:...statuses)', { statuses: [CryptoPayoutStatus.COMPLETED, CryptoPayoutStatus.PROCESSING, CryptoPayoutStatus.PENDING] })
      .getRawOne();

    const totalIn = Number(incoming?.total ?? 0);
    const totalOut = Number(outgoing?.total ?? 0);

    return { totalIn, totalOut, available: totalIn - totalOut };
  }

  // ── Payouts ──

  async initiateWithdrawal(
    groupId: string,
    organizationId: string,
    userId: string,
    data: { chain: string; token: string; amount: number; toAddress: string; category?: string; refundPlayerId?: string; pin: string },
  ) {
    const group = await this.ensureGroup(groupId, organizationId);

    // Verify transfer PIN
    const pinOk = await this.users.verifyTransferPin(userId, data.pin);
    if (!pinOk) throw new BadRequestException('Invalid transfer PIN');

    // Check balance
    const balance = await this.getGroupBalance(groupId, organizationId);
    if (data.amount > balance.available) {
      throw new BadRequestException(`Insufficient balance. Available: $${balance.available.toFixed(2)}`);
    }

    // Create the outgoing transfer record
    const payout = this.outgoingRepo.create({
      groupId,
      chain: data.chain,
      token: data.token,
      amount: data.amount,
      toAddress: data.toAddress,
      status: CryptoPayoutStatus.PENDING,
      initiatedById: userId,
      category: data.category as any,
      refundPlayerId: data.refundPlayerId,
    });
    const saved = await this.outgoingRepo.save(payout);

    // In Phase 1, payouts are manual — the platform admin processes them.
    // The status stays 'pending' until manually completed.
    this.logger.log(`Withdrawal initiated for group ${groupId}: $${data.amount} ${data.token} on ${data.chain} to ${data.toAddress}`);

    return saved;
  }

  async listPayouts(groupId: string, organizationId: string) {
    await this.ensureGroup(groupId, organizationId);

    return this.outgoingRepo.find({
      where: { groupId },
      relations: ['initiatedBy', 'refundPlayer'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── Supported chains ──

  getSupportedChains() {
    return Object.entries(CHAINS)
      .filter(([, c]) => c.phase1)
      .map(([id, c]) => ({
        id,
        name: c.name,
        family: c.family,
        tokens: supportedTokens(id),
      }));
  }

  // ── Helpers ──

  private async ensureGroup(groupId: string, organizationId: string): Promise<Group> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, organizationId },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  private async findTransfer(transferId: string, organizationId: string): Promise<CryptoTransfer> {
    const transfer = await this.transferRepo.findOne({
      where: { id: transferId },
      relations: ['group'],
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.group?.organizationId !== organizationId) {
      throw new NotFoundException('Transfer not found');
    }
    return transfer;
  }
}
