import { IsString, IsNumber, IsEnum, IsOptional, Min, IsNotEmpty, MinLength, IsBoolean, Matches, IsIn } from 'class-validator';
import { PaymentType, CONTRIBUTIONS_VISIBILITY, type ContributionsVisibility } from '../entities/group.entity';

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
}
