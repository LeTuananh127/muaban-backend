import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductAndAuctionDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async createListing(createData: CreateProductAndAuctionDto, ownerId: string) {
    const { 
      title, description, images, condition, location, categoryId, 
      startingPrice, reservePrice, buyNowPrice, shippingCost, endTime 
    } = createData;

    const end = new Date(endTime);
    if (new Date() >= end) {
      throw new BadRequestException('End time must be in the future');
    }

    // Check category exists
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException('Owner not found');
    if (owner.sellerVerificationStatus !== 'APPROVED') {
      throw new BadRequestException('Seller account is not approved yet');
    }

    // Mở transaction vừa tạo Product vừa tạo Auction
    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo Product, gán status thành IN_AUCTION ngay lập tức
      const product = await prisma.product.create({
        data: {
          title,
          description,
          images: images || [],
          condition,
          location,
          categoryId,
          ownerId,
          status: 'IN_AUCTION'
        },
      });

      // 2. Tạo Auction
      const auction = await prisma.auction.create({
        data: {
          productId: product.id,
          startingPrice,
          currentPrice: startingPrice,
          reservePrice,
          buyNowPrice,
          shippingCost,
          endTime: end,
          status: 'PENDING_APPROVAL'
        },
      });

      return { product, auction };
    });
  }

  async findAll() {
    return this.prisma.product.findMany({
      include: {
        category: true,
        owner: { select: { id: true, name: true, avatar: true, rating: true } },
        auction: true
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        owner: { select: { id: true, name: true, avatar: true, rating: true } },
        auction: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findByOwner(ownerId: string) {
    return this.prisma.product.findMany({
      where: { ownerId },
      include: { auction: true },
    });
  }
}
