import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(reviewerId: string, revieweeId: string, orderId: string, rating: number, comment?: string, images: string[] = []) {
    if (reviewerId === revieweeId) {
      throw new BadRequestException('You cannot review yourself');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check if this specific order exists and involves both users
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isParticipant =
      (order.buyerId === reviewerId && order.sellerId === revieweeId) ||
      (order.buyerId === revieweeId && order.sellerId === reviewerId);

    if (!isParticipant) {
      throw new BadRequestException('You can only review participants of this order');
    }

    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
      throw new BadRequestException('You can only review after the order is delivered or completed');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingReview = await tx.review.findFirst({
        where: {
          reviewerId,
          orderId,
        },
      });

      const review = existingReview
        ? await tx.review.update({
            where: { id: existingReview.id },
            data: {
              rating,
              comment,
              images,
            },
          })
        : await tx.review.create({
            data: {
              reviewerId,
              revieweeId,
              orderId,
              rating,
              comment,
              images,
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
        order: {
          include: {
            auction: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyReceivedReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      include: {
        reviewer: { select: { id: true, name: true, avatar: true } },
        order: {
          include: {
            auction: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyGivenReviews(userId: string) {
    return this.prisma.review.findMany({
      where: { reviewerId: userId },
      include: {
        reviewee: { select: { id: true, name: true, avatar: true } },
        order: {
          include: {
            auction: {
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
