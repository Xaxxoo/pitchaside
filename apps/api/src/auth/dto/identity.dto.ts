import { IsOptional, Matches } from 'class-validator';

/** An organiser's identity numbers: both a BVN and a NIN are required to unlock a collection account. */
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
