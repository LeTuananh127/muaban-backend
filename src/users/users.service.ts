import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, avatar: true,
        role: true, status: true, rating: true, totalReviews: true,
        shopName: true, sellerVerificationStatus: true,
        idNumber: true, idImages: true, warehouseAddress: true,
        bankAccount: true, phone: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: id },
      include: { order: true },
    });

    const sellerReviews = reviews.filter((r) => r.order && r.order.sellerId === id);
    const buyerReviews = reviews.filter((r) => r.order && r.order.buyerId === id);

    const sellerRating = sellerReviews.length > 0
      ? sellerReviews.reduce((sum, r) => sum + r.rating, 0) / sellerReviews.length
      : (user.rating || 5.0);
    const sellerTrustScore = Math.min(100, Math.round(sellerRating * 20));

    const buyerRating = buyerReviews.length > 0
      ? buyerReviews.reduce((sum, r) => sum + r.rating, 0) / buyerReviews.length
      : 5.0;
    const buyerTrustScore = Math.min(100, Math.round(buyerRating * 20));

    return {
      ...user,
      sellerRating,
      sellerReviewsCount: sellerReviews.length,
      sellerTrustScore,
      buyerRating,
      buyerReviewsCount: buyerReviews.length,
      buyerTrustScore,
    };
  }

  async updateProfile(id: string, data: { name?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, name: true, avatar: true,
        role: true, rating: true, totalReviews: true,
      },
    });
  }

  async submitSellerVerification(
    id: string,
    data: {
      shopName: string;
      idNumber: string;
      idImages: string[];
      warehouseAddress: string;
      bankAccount: string;
      phone?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        shopName: data.shopName,
        idNumber: data.idNumber,
        idImages: data.idImages,
        warehouseAddress: data.warehouseAddress,
        bankAccount: data.bankAccount,
        phone: data.phone,
        sellerVerificationStatus: 'PENDING',
      },
      select: {
        id: true,
        email: true,
        name: true,
        sellerVerificationStatus: true,
        shopName: true,
        idNumber: true,
        idImages: true,
      },
    });
  }

  async createReport(
    reporterId: string,
    data: {
      reason: string;
      reportedUserId?: string;
      auctionId?: string;
    },
  ) {
    return this.prisma.report.create({
      data: {
        reason: data.reason,
        reporterId,
        reportedUserId: data.reportedUserId || null,
        auctionId: data.auctionId || null,
        status: 'PENDING',
      },
    });
  }

  // ===================== THỐNG KÊ CÁ NHÂN NGƯỜI DÙNG =====================
  async getUserAnalytics(userId: string, period: 'day' | 'month' | 'year' = 'month') {
    const now = new Date();
    let startDate: Date;
    let points: number;

    if (period === 'day') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      points = 30;
    } else if (period === 'month') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      points = 12;
    } else {
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 4);
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      points = 5;
    }

    const getKey = (date: Date): string => {
      if (period === 'day') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } else if (period === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        return `${date.getFullYear()}`;
      }
    };

    const labels: string[] = [];
    const d = new Date(startDate);
    for (let i = 0; i < points; i++) {
      labels.push(getKey(d));
      if (period === 'day') d.setDate(d.getDate() + 1);
      else if (period === 'month') d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
    }

    const [sellingOrders, buyingOrders, myAuctions, myBids] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId: userId, createdAt: { gte: startDate } },
        select: { price: true, status: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { buyerId: userId, createdAt: { gte: startDate } },
        select: { price: true, status: true, createdAt: true },
      }),
      this.prisma.auction.findMany({
        where: { product: { ownerId: userId }, createdAt: { gte: startDate } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.bid.findMany({
        where: { bidderId: userId, createdAt: { gte: startDate } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    // Grouping
    const salesRevMap: Record<string, number> = {};
    const salesCountMap: Record<string, number> = {};
    const spendMap: Record<string, number> = {};
    const buysCountMap: Record<string, number> = {};
    const bidsCountMap: Record<string, number> = {};

    for (const order of sellingOrders) {
      const key = getKey(new Date(order.createdAt));
      salesCountMap[key] = (salesCountMap[key] ?? 0) + 1;
      if (order.status === 'COMPLETED' || order.status === 'PAID' || order.status === 'DELIVERED') {
        salesRevMap[key] = (salesRevMap[key] ?? 0) + order.price;
      }
    }

    for (const order of buyingOrders) {
      const key = getKey(new Date(order.createdAt));
      buysCountMap[key] = (buysCountMap[key] ?? 0) + 1;
      if (order.status === 'COMPLETED' || order.status === 'PAID' || order.status === 'DELIVERED') {
        spendMap[key] = (spendMap[key] ?? 0) + order.price;
      }
    }

    for (const bid of myBids) {
      const key = getKey(new Date(bid.createdAt));
      bidsCountMap[key] = (bidsCountMap[key] ?? 0) + 1;
    }

    const series = labels.map((label) => ({
      label,
      salesRevenue: salesRevMap[label] ?? 0,
      salesCount: salesCountMap[label] ?? 0,
      purchaseSpending: spendMap[label] ?? 0,
      buysCount: buysCountMap[label] ?? 0,
      bidsPlaced: bidsCountMap[label] ?? 0,
    }));

    const totals = {
      salesRevenue: sellingOrders
        .filter((o) => o.status === 'COMPLETED' || o.status === 'PAID' || o.status === 'DELIVERED')
        .reduce((s, o) => s + o.price, 0),
      salesCount: sellingOrders.length,
      purchaseSpending: buyingOrders
        .filter((o) => o.status === 'COMPLETED' || o.status === 'PAID' || o.status === 'DELIVERED')
        .reduce((s, o) => s + o.price, 0),
      buysCount: buyingOrders.length,
      auctionsCreated: myAuctions.length,
      bidsPlaced: myBids.length,
    };

    return { period, labels, series, totals };
  }
}
