import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsEmail, IsIn, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { PLAYER_LEVELS, type PlayerLevel } from '../../ratings/skill';
import { KEEPER_PREFS } from '../../ratings/plan';
import type { KeeperPref } from '@pitchaside/shared';
import { tidyPhone } from '../../common/phone';

export class CreatePlayerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  /** What they're called on the pitch; blank clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  nickname?: string;

  @IsOptional()
  @Transform(({ value }) => tidyPhone(value))
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** How good they are before they've played here; seeds their skill rating for team balancing. */
  @IsOptional()
  @IsIn(PLAYER_LEVELS)
  level?: PlayerLevel;
}

/**
 * Editing a player: the same fields, each optional. A real class (not Partial<CreatePlayerDto>,
 * which the validation pipe can't see) so it's checked and anything else is stripped.
 */
export class UpdatePlayerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName?: string;

  /** What they're called on the pitch; blank clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  nickname?: string;

  @IsOptional()
  @Transform(({ value }) => tidyPhone(value))
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** How good they are before they've played here; seeds their skill rating for team balancing. */
  @IsOptional()
  @IsIn(PLAYER_LEVELS)
  level?: PlayerLevel;

  /** Happy in goal, or would rather not, for the match day plan's swaps; null: doesn't mind. */
  @IsOptional()
  @IsIn(KEEPER_PREFS)
  keeper?: KeeperPref;
}
