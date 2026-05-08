import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';

export class CreateProductAndAuctionDto {
  // Product Information
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  // Auction Information
  @IsNumber()
  @IsNotEmpty()
  @Min(1000)
  startingPrice: number;

  @IsNumber()
  @IsOptional()
  reservePrice?: number;

  @IsNumber()
  @IsOptional()
  buyNowPrice?: number;

  @IsNumber()
  @IsOptional()
  shippingCost?: number;

  @IsString()
  @IsNotEmpty()
  endTime: string;
}
