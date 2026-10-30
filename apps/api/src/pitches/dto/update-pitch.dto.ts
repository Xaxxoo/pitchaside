import { IsString, IsNotEmpty, MinLength, IsOptional, IsNumber, Min, IsInt, Max, IsIn, MaxLength, Matches, IsArray, ArrayUnique } from 'class-validator';
import { MAP_URL, PITCH_A_SIDE, PITCH_FACILITIES, PITCH_SURFACES } from '../pitch-details';

export class UpdatePitchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(MAP_URL, { message: 'Paste a Google Maps or Apple Maps link' })
  mapUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  directions?: string | null;

  @IsOptional()
  @IsIn(PITCH_A_SIDE)
  aSide?: number | null;

  @IsOptional()
  @IsIn(PITCH_SURFACES)
  surface?: string | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(150)
  lengthM?: number | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(150)
  widthM?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PITCH_FACILITIES, { each: true })
  facilities?: string[];
}
