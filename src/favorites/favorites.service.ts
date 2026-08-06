import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getUserFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        auction: {
          include: {
            product: {
              include: {
                category: true,
                owner: { select: { id: true, name: true, avatar: true, rating: true } },
              },
            },
            bids: true,
            _count: { select: { bids: true } },
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
      include: { product: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    const fav = await this.prisma.favorite.create({
      data: {
        userId,
        auctionId,
      },
    });

    try {
      await this.notificationsService.createNotification(userId, {
        title: 'Đã thêm vào Sản phẩm Yêu thích',
        content: `Bạn đã thả tim theo dõi sản phẩm "${auction.product.title}". Bạn sẽ tự động nhận thông báo khi sản phẩm này có biến động giá mới.`,
        type: 'FAVORITE_ADDED',
        referenceId: auctionId,
      });
    } catch (e) {
      console.error('Error creating favorite added notification:', e);
    }

    return fav;
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
