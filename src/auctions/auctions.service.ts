import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuctionDto } from './dto/auction.dto';

@Injectable()
export class AuctionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAuctionDto: CreateAuctionDto, userId: string) {
    const { productId, startingPrice, bidIncrement, startTime, endTime } = createAuctionDto;

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
    const auction = await this.prisma.auction.findUnique({
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

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    await this.prisma.auction.update({
      where: { id },
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
}
