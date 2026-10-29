import { IsString, IsNotEmpty, Matches, IsOptional, IsDateString, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  pitchId: string;

  @IsDateString()
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm' })
  endTime: string;

  @IsString()
  @IsNotEmpty()
  bookerName: string;

  @IsOptional()
  @IsString()
  bookerPhone?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
