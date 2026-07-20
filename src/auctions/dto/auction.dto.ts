import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateAuctionDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1000)
  startingPrice: number;

  @IsNumber()
  @IsOptional()
  @Min(1000)
  bidIncrement?: number;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @IsNumber()
  @IsOptional()
  minTrustScore?: number;
}
