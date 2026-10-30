import { IsDateString, IsInt, Max, IsString, IsNumber, IsEnum, IsOptional, Min, IsNotEmpty, MinLength, IsBoolean, Matches, IsIn, IsObject } from 'class-validator';
import type { Bibs, GroupScope } from '@pitchaside/shared';
import { PaymentType, CONTRIBUTIONS_VISIBILITY, type ContributionsVisibility } from '../entities/group.entity';

const SCOPES: GroupScope[] = ['local', 'international'];

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  schedule?: string;

  @IsNumber()
  @Min(1)
  targetPlayers: number;

  @IsNumber()
  @Min(0)
  feePerPlayer: number;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsBoolean()
  requireRsvp?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Kick-off time must be HH:mm' })
  kickoffTime?: string;

  @IsOptional()
  @IsIn(CONTRIBUTIONS_VISIBILITY)
  contributionsVisibility?: ContributionsVisibility;

  /** How long each game usually lasts on match day, in minutes; null for the usual 7. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  gameMinutes?: number | null;

  /** Show the match-day timer; off hides it for everyone in the group. */
  @IsOptional()
  @IsBoolean()
  timerOn?: boolean;

  /** Each side's bib colour and optional name; left out for the default colours. Checked by cleanBibs. */
  @IsOptional()
  @IsObject()
  bibs?: Bibs | null;

  /** 'local' (Nigeria, bank transfers) or 'international' (crypto). Defaults to 'local'. */
  @IsOptional()
  @IsIn(SCOPES)
  scope?: GroupScope;
}

/**
 * Editing a group: the same fields, each optional. A real class (not Partial<CreateGroupDto>,
 * which the validation pipe can't see) so it's checked and anything else, such as account or
 * payee details, is stripped. Those change only through their own endpoints.
 */
export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  schedule?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  targetPlayers?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feePerPlayer?: number;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsBoolean()
  requireRsvp?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Kick-off time must be HH:mm' })
  kickoffTime?: string;

  @IsOptional()
  @IsIn(CONTRIBUTIONS_VISIBILITY)
  contributionsVisibility?: ContributionsVisibility;

  /** How long each game usually lasts on match day, in minutes; null for the usual 7. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  gameMinutes?: number | null;

  /** Show the match-day timer; off hides it for everyone in the group. */
  @IsOptional()
  @IsBoolean()
  timerOn?: boolean;

  /** Each side's bib colour and optional name; null goes back to the default colours. Checked by cleanBibs. */
  @IsOptional()
  @IsObject()
  bibs?: Bibs | null;

  /** Match days before this date (YYYY-MM-DD) stop counting for stats and votes; null counts them all. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'statsFrom must be a date like 2026-10-25' })
  @IsDateString({ strict: true })
  statsFrom?: string | null;
}
