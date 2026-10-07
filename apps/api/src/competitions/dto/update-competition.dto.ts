import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
  MinLength,
} from 'class-validator';
import { CompetitionFormat, CompetitionScope, CompetitionVisibility } from '../entities/competition.entity';

export class UpdateCompetitionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CompetitionFormat)
  format?: CompetitionFormat;

  @IsOptional()
  @IsEnum(CompetitionScope)
  scope?: CompetitionScope;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(CompetitionVisibility)
  visibility?: CompetitionVisibility;

  @IsOptional()
  @IsNumber()
  @Min(0)
  entryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(256)
  maxTeams?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minPlayersPerTeam?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPlayersPerTeam?: number;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  rules?: string;
}
