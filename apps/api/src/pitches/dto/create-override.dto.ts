import { IsString, IsNotEmpty, Matches, IsOptional, IsNumber, Min, IsIn, IsDateString } from 'class-validator';

export class CreateOverrideDto {
  @IsDateString()
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
  startTime: string;

  @Matches(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, { message: 'endTime must be HH:mm' })
  endTime: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['blocked', 'added', 'price_override'])
  type: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
