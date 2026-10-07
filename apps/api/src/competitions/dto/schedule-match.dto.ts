import { IsOptional, IsString, Matches, IsDateString } from 'class-validator';

export class ScheduleMatchDto {
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  scheduledTime?: string;

  @IsOptional()
  @IsString()
  venue?: string;
}
