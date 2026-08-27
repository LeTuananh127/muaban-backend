import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuctionDto } from './dto/auction.dto';

@Injectable()
export class AuctionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAuctionDto: CreateAuctionDto, userId: string) {
    const { productId, startingPrice, bidIncrement, startTime, endTime, minTrustScore } = createAuctionDto;

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.ownerId !== userId) {
      throw new ForbiddenException('You do not own this product');
    }
    if (product.status !== 'AVAILABLE') {
      throw new BadRequestException('Product is already in an auction or sold');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
      throw new BadRequestException('End time must be after start time');
    }

    return this.prisma.$transaction(async (tx) => {
      const auction = await tx.auction.create({
        data: {
          productId,
          startingPrice,
          currentPrice: startingPrice,
          bidIncrement: bidIncrement || 10000,
          minTrustScore: minTrustScore || 0,
          startTime: start,
          endTime: end,
          status: new Date() >= start ? 'ACTIVE' : 'UPCOMING',
        },
      });

      await tx.product.update({
        where: { id: productId },
        data: { status: 'IN_AUCTION' },
      });

      return auction;
    });
  }

  async findAllActive() {
    return this.prisma.auction.findMany({
      where: {
        status: { in: ['ACTIVE', 'UPCOMING'] },
      },
      include: {
        product: {
          include: {
            category: true,
            owner: {
              select: {
                id: true,
                name: true,
                avatar: true,
                rating: true,
                totalReviews: true,
              },
            },
          },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { endTime: 'asc' },
    });
  }

  async findOne(id: string) {
    // Thử tìm bằng auction ID trước, nếu không có thì thử tìm bằng product ID
    let auction = await this.prisma.auction.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                avatar: true,
                rating: true,
                totalReviews: true,
              },
            },
            category: true,
          },
        },
        bids: {
          orderBy: { amount: 'desc' },
          take: 10,
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        _count: { select: { bids: true } },
      },
    });

    // Nếu không tìm thấy bằng auction ID → thử tìm theo product ID
    if (!auction) {
      auction = await this.prisma.auction.findFirst({
        where: { productId: id },
        include: {
          product: {
            include: {
              owner: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  rating: true,
                  totalReviews: true,
                },
              },
              category: true,
            },
          },
          bids: {
            orderBy: { amount: 'desc' },
            take: 10,
            include: {
              user: { select: { id: true, name: true, avatar: true } },
            },
          },
          _count: { select: { bids: true } },
        },
      });
    }

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    await this.prisma.auction.update({
      where: { id: auction.id },
      data: { views: { increment: 1 } },
    });

    return auction;
  }

  async searchAuctions(query: Record<string, string | undefined>) {
    const q = query.q?.trim();
    const categoryId = query.categoryId;
    const minPrice = query.minPrice ? Number(query.minPrice) : undefined;
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
    const status = query.status;
    const sortBy = query.sortBy;
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 12;

    const where: any = {};

    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['ACTIVE', 'UPCOMING'] };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.currentPrice = {};
      if (minPrice !== undefined && !Number.isNaN(minPrice)) {
        where.currentPrice.gte = minPrice;
      }
      if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
        where.currentPrice.lte = maxPrice;
      }
    }

    const productWhere: any = {};
    if (q) {
      productWhere.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (categoryId) {
      productWhere.categoryId = categoryId;
    }
    if (Object.keys(productWhere).length > 0) {
      where.product = { is: productWhere };
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'price_asc') {
      orderBy = { currentPrice: 'asc' };
    }
    if (sortBy === 'price_desc') {
      orderBy = { currentPrice: 'desc' };
    }
    if (sortBy === 'ending_soon') {
      orderBy = { endTime: 'asc' };
    }
    if (sortBy === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safeLimit = Number.isNaN(limit) || limit < 1 ? 12 : Math.min(limit, 50);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        take: safeLimit,
        skip,
        orderBy,
        include: {
          product: {
            include: {
              category: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  rating: true,
                  totalReviews: true,
                },
              },
            },
          },
          _count: { select: { bids: true } },
        },
      }),
      this.prisma.auction.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getSearchSuggestions(q?: string, limit?: string) {
    const keyword = q?.trim();
    if (!keyword || keyword.length < 2) {
      return { data: [] };
    }

    const parsedLimit = limit ? Number(limit) : 8;
    const safeLimit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 8 : Math.min(parsedLimit, 20);

    const products = await this.prisma.product.findMany({
      where: {
        auction: {
          is: {
            status: { in: ['ACTIVE', 'UPCOMING'] },
          },
        },
        title: {
          contains: keyword,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: safeLimit * 2,
    });

    const uniqueByTitle = new Map<string, { productId: string; title: string }>();
    for (const product of products) {
      const key = product.title.toLowerCase();
      if (!uniqueByTitle.has(key)) {
        uniqueByTitle.set(key, { productId: product.id, title: product.title });
      }
      if (uniqueByTitle.size >= safeLimit) {
        break;
      }
    }

    return {
      data: Array.from(uniqueByTitle.values()),
    };
  }

  async buyNow(auctionId: string, buyerId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        product: true,
      },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (!auction.buyNowPrice) {
      throw new BadRequestException('This auction does not have a buy now price');
    }

    if (auction.product.ownerId === buyerId) {
      throw new BadRequestException('You cannot buy your own auction');
    }

    if (auction.status !== 'ACTIVE') {
      throw new BadRequestException('This auction is not active');
    }

    // Create order with buy now price




    try {
      const totalAmount = (auction.buyNowPrice as number) + (auction.shippingCost || 0);

      return await this.prisma.$transaction(async (tx) => {
        const existingOrder = await tx.order.findUnique({
          where: { auctionId },
          include: {
            auction: { include: { product: true } },
            buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
            seller: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
          },
        });

        if (existingOrder) {
          return existingOrder;
        }

        const order = await tx.order.create({
          data: {
            auctionId,
            buyerId,
            sellerId: auction.product.ownerId,
            totalAmount,
            status: OrderStatus.PENDING,
          },
          include: {
            auction: { include: { product: true } },
            buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
            seller: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
          },
        });

        // Mark auction as ended
        await tx.auction.update({
          where: { id: auctionId },
          data: {
            status: 'ENDED',
            currentWinnerId: buyerId,
          },
        });

        await tx.product.update({
          where: { id: auction.productId },
          data: { status: 'SOLD' },
        });

        return order;
      });
    } catch (error) {
      console.error('buyNow failed', { auctionId, buyerId, error });
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Unable to buy now');
    }
  }

  async relistAuction(
    auctionId: string,
    sellerId: string,
    dto: { startingPrice?: number; bidIncrement?: number; durationDays?: number; buyNowPrice?: number; endTime?: string },
  ) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true, order: true },
    });
    if (!auction) throw new NotFoundException('Không tìm thấy phiên đấu giá');
    if (auction.product.ownerId !== sellerId) {
      throw new ForbiddenException('Bạn không phải chủ sở hữu của sản phẩm này');
    }

    // Check if there is already a completed or paid order
    if (auction.order) {
      const s = auction.order.status;
      if (
        s === OrderStatus.COMPLETED ||
        s === OrderStatus.PAID ||
        s === OrderStatus.SHIPPED ||
        s === OrderStatus.DELIVERED
      ) {
        throw new BadRequestException('Sản phẩm này đã có đơn hàng thành công, không thể tái đăng đấu giá');
      }
    }

    const now = new Date();
    let newEnd: Date;
    if (dto.endTime) {
      newEnd = new Date(dto.endTime);
    } else {
      const days = dto.durationDays && dto.durationDays > 0 ? dto.durationDays : 3;
      newEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    }

    if (newEnd <= now) {
      throw new BadRequestException('Thời gian kết thúc phải lớn hơn thời gian hiện tại');
    }

    const newStartingPrice = dto.startingPrice && dto.startingPrice > 0 ? dto.startingPrice : auction.startingPrice;
    const newBidIncrement = dto.bidIncrement && dto.bidIncrement > 0 ? dto.bidIncrement : auction.bidIncrement;

    return this.prisma.$transaction(async (tx) => {
      // Update product to IN_AUCTION
      await tx.product.update({
        where: { id: auction.productId },
        data: {
          status: 'IN_AUCTION',
          ...(dto.buyNowPrice !== undefined ? { buyNowPrice: dto.buyNowPrice } : {}),
        },
      });

      // Update auction to ACTIVE
      const updated = await tx.auction.update({
        where: { id: auctionId },
        data: {
          status: 'ACTIVE',
          startTime: now,
          endTime: newEnd,
          startingPrice: newStartingPrice,
          currentPrice: newStartingPrice,
          bidIncrement: newBidIncrement,
          currentWinnerId: null,
        },
        include: {
          product: {
            include: {
              category: true,
              owner: {
                select: { id: true, name: true, avatar: true, rating: true, totalReviews: true },
              },
            },
          },
        },
      });

      return {
        message: 'Tái đăng đấu giá thành công!',
        auction: updated,
      };
    });
  }
}
