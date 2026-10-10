import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AuditAction {
  PAYMENT_MARKED_PAID = 'payment_marked_paid',
  PAYMENT_WAIVED = 'payment_waived',
  PAYMENT_MARKED_UNPAID = 'payment_marked_unpaid',
  PAYMENT_BULK_MARKED_PAID = 'payment_bulk_marked_paid',
  SESSION_CREATED = 'session_created',
  SESSION_STATUS_CHANGED = 'session_status_changed',
  GROUP_CREATED = 'group_created',
  PLAYER_CREATED = 'player_created',
  MEMBER_ADDED = 'member_added',
  MEMBER_REMOVED = 'member_removed',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column()
  userId: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
