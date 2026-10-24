import { Transform } from 'class-transformer';
import { tidyPhone } from '../../common/phone';
import { IsString, IsNotEmpty, MinLength, IsOptional, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  /** Links this organiser account to their player side. Empty string clears it. */
  @IsOptional()
  @Transform(({ value }) => tidyPhone(value))
  @Matches(/^$|^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;

  /** Bank Verification Number — required before creating a group collection account. */
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'BVN must be exactly 11 digits' })
  bvn?: string;
}
