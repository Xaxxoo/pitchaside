import { IsString, IsOptional, IsEmail, IsNotEmpty, MinLength, Matches } from 'class-validator';

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
}
