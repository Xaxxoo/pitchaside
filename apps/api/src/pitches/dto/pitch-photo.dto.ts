import { IsString, MaxLength } from 'class-validator';

/** A pitch photo from the phone as a data URL (up to MAX_PITCH_PHOTO_BYTES once decoded); checked by parsePhoto. */
export class PitchPhotoDto {
  @IsString()
  @MaxLength(420_000)
  image: string;
}
