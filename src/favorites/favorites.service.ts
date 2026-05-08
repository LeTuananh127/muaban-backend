import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        auction: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(userId: string, auctionId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: {
        userId_auctionId: { userId, auctionId },
      },
    });

    if (existing) {
      throw new ConflictException('Auction is already in favorites');
    }

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    return this.prisma.favorite.create({
      data: {
        userId,
        auctionId,
      },
    });
  }

  async removeFavorite(userId: string, auctionId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: {
        userId_auctionId: { userId, auctionId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Favorite not found');
    }

    return this.prisma.favorite.delete({
      where: {
        userId_auctionId: { userId, auctionId },
      },
    });
  }
}
