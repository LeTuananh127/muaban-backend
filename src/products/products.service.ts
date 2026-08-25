import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductAndAuctionDto, UpdateProductAndAuctionDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async createListing(createData: CreateProductAndAuctionDto, ownerId: string) {
    const { 
      title, description, images, condition, location, categoryId, 
      startingPrice, reservePrice, buyNowPrice, shippingCost, bidIncrement,
      extendTriggerMinutes, extendDurationMinutes, layoutType, minTrustScore, endTime 
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

    const finalLocation = (location && location.trim()) ? location : (owner.warehouseAddress || 'Chưa cập nhật địa điểm');

    // Mở transaction vừa tạo Product vừa tạo Auction
    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo Product, gán status thành IN_AUCTION ngay lập tức
      const product = await prisma.product.create({
        data: {
          title,
          description,
          images: images || [],
          condition,
          location: finalLocation,
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
          bidIncrement: (bidIncrement && bidIncrement >= 1000) ? bidIncrement : 10000,
          extendTriggerMinutes: extendTriggerMinutes !== undefined ? Number(extendTriggerMinutes) : 2,
          extendDurationMinutes: extendDurationMinutes !== undefined ? Number(extendDurationMinutes) : 2,
          layoutType: layoutType || 'standard',
          minTrustScore: minTrustScore !== undefined ? Number(minTrustScore) : 0,
          endTime: end,
          status: 'ACTIVE'
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

  private async findProductByIdOrAuctionId(id: string) {
    let product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        owner: { select: { id: true, name: true, avatar: true, rating: true } },
        auction: { include: { bids: true, order: true } },
      },
    });

    if (!product) {
      const auction = await this.prisma.auction.findUnique({
        where: { id },
        include: {
          product: {
            include: {
              category: true,
              owner: { select: { id: true, name: true, avatar: true, rating: true } },
              auction: { include: { bids: true, order: true } },
            },
          },
        },
      });
      if (auction && auction.product) {
        product = auction.product;
      }
    }

    return product;
  }

  async findOne(id: string) {
    const product = await this.findProductByIdOrAuctionId(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findByOwner(ownerId: string) {
    return this.prisma.product.findMany({
      where: { ownerId },
      include: {
        category: true,
        owner: { select: { id: true, name: true, avatar: true } },
        auction: {
          include: {
            currentWinner: { select: { id: true, name: true, avatar: true } },
            order: true,
            bids: {
              include: {
                user: { select: { id: true, name: true, avatar: true } }
              },
              orderBy: { amount: 'desc' }
            },
            _count: {
              select: { bids: true }
            }
          }
        }
      },
    });
  }

  async updateListing(id: string, updateData: UpdateProductAndAuctionDto, ownerId: string) {
    const product = await this.findProductByIdOrAuctionId(id);

    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) {
      throw new BadRequestException('You do not own this product');
    }

    const bidsCount = product.auction?.bids?.length ?? 0;
    const hasBids = bidsCount > 0;

    const {
      title, description, images, condition, location, categoryId,
      startingPrice, reservePrice, buyNowPrice, shippingCost, bidIncrement,
      extendTriggerMinutes, extendDurationMinutes, layoutType, endTime
    } = updateData;

    if (categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    if (hasBids) {
      if (
        startingPrice !== undefined ||
        reservePrice !== undefined ||
        buyNowPrice !== undefined ||
        shippingCost !== undefined ||
        bidIncrement !== undefined ||
        endTime !== undefined
      ) {
        throw new BadRequestException('Cannot edit pricing, increment or end time once bids have been placed');
      }
    }

    return this.prisma.$transaction(async (prisma) => {
      const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: {
          title: title !== undefined ? title : undefined,
          description: description !== undefined ? description : undefined,
          images: images !== undefined ? images : undefined,
          condition: condition !== undefined ? condition : undefined,
          location: location !== undefined ? location : undefined,
          categoryId: categoryId !== undefined ? categoryId : undefined,
        },
      });

      if (product.auction) {
        const auctionData: any = {};
        if (startingPrice !== undefined) {
          auctionData.startingPrice = startingPrice;
          if (product.auction.currentPrice === product.auction.startingPrice) {
            auctionData.currentPrice = startingPrice;
          }
        }
        if (reservePrice !== undefined) auctionData.reservePrice = reservePrice;
        if (buyNowPrice !== undefined) auctionData.buyNowPrice = buyNowPrice;
        if (shippingCost !== undefined) auctionData.shippingCost = shippingCost;
        if (bidIncrement !== undefined) auctionData.bidIncrement = bidIncrement;
        if (extendTriggerMinutes !== undefined) auctionData.extendTriggerMinutes = Number(extendTriggerMinutes);
        if (extendDurationMinutes !== undefined) auctionData.extendDurationMinutes = Number(extendDurationMinutes);
        if (layoutType !== undefined) auctionData.layoutType = layoutType;
        if (endTime !== undefined) {
          const end = new Date(endTime);
          if (new Date() >= end) {
            throw new BadRequestException('End time must be in the future');
          }
          auctionData.endTime = end;
        }

        if (Object.keys(auctionData).length > 0) {
          await prisma.auction.update({
            where: { id: product.auction.id },
            data: auctionData,
          });
        }
      }

      return this.findOne(product.id);
    });
  }

  async deleteListing(id: string, ownerId: string) {
    const product = await this.findProductByIdOrAuctionId(id);

    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) {
      throw new BadRequestException('You do not own this product');
    }

    const bidsCount = product.auction?.bids?.length ?? 0;
    const hasOrder = !!product.auction?.order;

    if (bidsCount > 0 || hasOrder) {
      throw new BadRequestException('Cannot delete product after bids have been placed or order has been created');
    }

    await this.prisma.product.delete({
      where: { id: product.id },
    });

    return { message: 'Product deleted successfully' };
  }

  async cancelListing(id: string, ownerId: string) {
    const product = await this.findProductByIdOrAuctionId(id);

    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) {
      throw new BadRequestException('You do not own this product');
    }

    if (!product.auction) {
      throw new BadRequestException('Product does not have an active auction');
    }

    if (product.auction.status !== 'ACTIVE') {
      throw new BadRequestException('Auction is not active');
    }

    const bidsCount = product.auction.bids.length;
    if (bidsCount > 0) {
      throw new BadRequestException('Cannot cancel auction after bids have been placed');
    }

    await this.prisma.auction.update({
      where: { id: product.auction.id },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Auction cancelled successfully' };
  }

  async relistListing(id: string, relistData: any, ownerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { auction: { include: { bids: true } } },
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.ownerId !== ownerId) {
      throw new BadRequestException('You do not own this product');
    }

    const auction = product.auction;
    if (!auction) {
      throw new BadRequestException('Product does not have an auction');
    }

    const { status } = auction;
    if (status !== 'ENDED' && status !== 'CANCELLED') {
      throw new BadRequestException('Auction must be ended or cancelled to relist');
    }

    const { startingPrice, reservePrice, buyNowPrice, shippingCost, endTime } = relistData;

    const end = new Date(endTime);
    if (new Date() >= end) {
      throw new BadRequestException('End time must be in the future');
    }

    return this.prisma.$transaction(async (prisma) => {
      await prisma.bid.deleteMany({
        where: { auctionId: auction.id },
      });

      await prisma.order.deleteMany({
        where: { auctionId: auction.id, status: 'PENDING' },
      });

      await prisma.auction.update({
        where: { id: auction.id },
        data: {
          startingPrice: startingPrice !== undefined ? startingPrice : auction.startingPrice,
          currentPrice: startingPrice !== undefined ? startingPrice : auction.startingPrice,
          reservePrice: reservePrice !== undefined ? reservePrice : auction.reservePrice,
          buyNowPrice: buyNowPrice !== undefined ? buyNowPrice : auction.buyNowPrice,
          shippingCost: shippingCost !== undefined ? shippingCost : auction.shippingCost,
          currentWinnerId: null,
          startTime: new Date(),
          endTime: end,
          status: 'ACTIVE',
          views: 0,
        },
      });

      await prisma.product.update({
        where: { id },
        data: { status: 'IN_AUCTION' },
      });

      return this.findOne(id);
    });
  }
}
