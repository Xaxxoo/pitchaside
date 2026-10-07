import { IsInt, IsOptional, Min } from 'class-validator';

export class RecordResultDto {
  @IsInt()
  @Min(0)
  homeScore: number;

  @IsInt()
  @Min(0)
  awayScore: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homePenalties?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayPenalties?: number;
}
