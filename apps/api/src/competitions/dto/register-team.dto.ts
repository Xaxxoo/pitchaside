import { IsString, IsNotEmpty, IsOptional, IsEmail, Matches, MinLength } from 'class-validator';

export class RegisterTeamDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  captainName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  captainPhone: string;

  @IsOptional()
  @IsEmail()
  captainEmail?: string;
}
