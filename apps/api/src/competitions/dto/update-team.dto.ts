import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * What an organiser can change on a registered team: its name and captain's details. Never its
 * id, competition, payment state or club — those come from registration and payment.
 */
export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  captainName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+\d][\d\s\-().]{6,}$/, { message: 'Phone number format is invalid' })
  captainPhone?: string;

  @IsOptional()
  @IsEmail()
  captainEmail?: string;
}
