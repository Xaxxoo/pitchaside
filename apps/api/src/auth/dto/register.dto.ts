import { Transform } from 'class-transformer';
import { tidyPhone } from '../../common/phone';
import { IsString, IsEmail, MinLength, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  organizationName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @Transform(({ value }) => tidyPhone(value))
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;
}
