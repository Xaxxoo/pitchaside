import { IsArray, IsUUID, ArrayMinSize, IsOptional, IsIn } from 'class-validator';

export class BulkMarkPaidDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  paymentIds: string[];

  @IsOptional()
  @IsIn(['cash', 'manual'])
  source?: 'cash' | 'manual';
}
