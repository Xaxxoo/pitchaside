import { Type } from 'class-transformer';
import { IsArray, ValidateNested, IsInt, Min, Max, Matches, IsOptional, IsNumber } from 'class-validator';

export class ScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be HH:mm' })
  openTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be HH:mm' })
  closeTime: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class SetScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots: ScheduleSlotDto[];
}
