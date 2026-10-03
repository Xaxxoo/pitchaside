import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class PushBroadcastDto {
  @IsString()
  @Length(1, 80)
  title: string;

  @IsString()
  @Length(1, 500)
  body: string;

  /** Internal app path opened when the notification is tapped. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^\/(?!\/)/, { message: 'url must be an internal path beginning with /' })
  url?: string;
}
