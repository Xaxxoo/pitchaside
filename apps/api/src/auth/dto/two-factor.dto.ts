import { IsString, IsNotEmpty } from 'class-validator';

export class TwoFactorVerifyDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class TwoFactorValidateDto {
  /** From the password step (`/auth/login` with 2FA on). */
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
