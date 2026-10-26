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
  @Matches(/^$|^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;
}
