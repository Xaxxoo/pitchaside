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
  ValidateIf,
} from 'class-validator';
import { CompetitionFormat, CompetitionScope, CompetitionVisibility } from '../entities/competition.entity';

export class CreateCompetitionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CompetitionFormat)
  format: CompetitionFormat;

  @IsEnum(CompetitionScope)
  scope: CompetitionScope;

  @ValidateIf((o) => o.scope === CompetitionScope.STATE || o.scope === CompetitionScope.CITY)
  @IsString()
  @IsNotEmpty()
  state?: string;

  @ValidateIf((o) => o.scope === CompetitionScope.CITY)
  @IsString()
  @IsNotEmpty()
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
