import { Transform } from 'class-transformer';
import { tidyPhone } from '../../common/phone';
import { IsString, IsOptional, IsEmail, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class JoinDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  @IsOptional()
  @Transform(({ value }) => tidyPhone(value))
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
