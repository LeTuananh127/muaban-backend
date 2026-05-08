import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(reviewerId: string, revieweeId: string, rating: number, comment?: string) {
    if (reviewerId === revieweeId) {
      throw new BadRequestException('You cannot review yourself');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check if they had a transaction together (Order exists where one is buyer and other is seller)
    const transaction = await this.prisma.order.findFirst({
      where: {
        OR: [
          { buyerId: reviewerId, sellerId: revieweeId },
          { buyerId: revieweeId, sellerId: reviewerId },
        ],
        status: 'DELIVERED',
      },
    });

    if (!transaction) {
      throw new BadRequestException('You can only review users you have completed transactions with');
    }

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          reviewerId,
          revieweeId,
          rating,
          comment,
        },
      });

      // Update user rating stats
      const userReviews = await tx.review.findMany({
        where: { revieweeId },
      });

      const totalReviews = userReviews.length;
      const averageRating = userReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

      await tx.user.update({
        where: { id: revieweeId },
        data: {
          rating: averageRating,
          totalReviews: totalReviews,
        },
      });

      return review;
    });
  }

  async getUserReviews(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      include: {
        reviewer: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
