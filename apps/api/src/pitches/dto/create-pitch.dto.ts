import { IsString, IsNotEmpty, MinLength, IsOptional, IsNumber, Min, IsInt, Max } from 'class-validator';

export class CreatePitchDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

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

  @IsNumber()
  @Min(0)
  defaultPrice: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
