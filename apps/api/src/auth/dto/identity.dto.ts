import { IsOptional, Matches } from 'class-validator';

/** An organiser's identity number: a BVN or a NIN (or both). Either unlocks a collection account. */
export class IdentityDto {
  /** Bank Verification Number: dial *565*0# to get it. */
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'BVN must be exactly 11 digits' })
  bvn?: string;

  /** National Identification Number: on the NIN slip or the NIMC app. */
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'NIN must be exactly 11 digits' })
  nin?: string;
}
