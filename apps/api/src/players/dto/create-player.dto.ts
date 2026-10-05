import { IsString, IsOptional, IsEmail, IsIn, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { PLAYER_LEVELS, type PlayerLevel } from '../../ratings/skill';

export class CreatePlayerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  @IsOptional()
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

  @IsOptional()
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
