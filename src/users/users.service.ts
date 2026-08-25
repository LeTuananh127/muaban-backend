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
        id: true, email: true, emailVerified: true, name: true, avatar: true,
        emailNotifications: true, defaultShippingAddress: true,
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

    // Truy vấn dữ liệu đơn hàng xuất bán, mua hàng, yêu cầu refund & lượt bid
    const [sellingOrders, buyingOrders, refundRequests, bidsPlacedCount] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId: id },
        select: { status: true },
      }),
      this.prisma.order.findMany({
        where: { buyerId: id },
        select: { status: true },
      }),
      this.prisma.refundRequest.findMany({
        where: { sellerId: id },
        select: { status: true },
      }),
      this.prisma.bid.count({
        where: { userId: id },
      }),
    ]);

    // ===================== A. THUẬT TOÁN ĐIỂM UY TÍN NGƯỜI BÁN (SELLER TRUST SCORE) =====================
    // 1. Bayesian Weighted Rating (45% trọng số)
    const C = 5;
    const m = 4.5;
    const nSeller = sellerReviews.length;
    const sumSellerRatings = sellerReviews.reduce((sum, r) => sum + r.rating, 0);
    const sellerBayesianRating = (C * m + sumSellerRatings) / (C + nSeller);
    const starRatingScore = (sellerBayesianRating / 5.0) * 45;

    // 2. Tỷ lệ Hoàn tất Đơn hàng xuất bán (25% trọng số)
    const totalSellingOrders = sellingOrders.length;
    const completedOrders = sellingOrders.filter((o) => ['COMPLETED', 'DELIVERED'].includes(o.status)).length;
    const completionRate = totalSellingOrders > 0 ? (completedOrders / totalSellingOrders) * 100 : 100;
    const completionScore = (completionRate / 100) * 25;

    // 3. Chỉ số Tranh chấp & Khiếu nại Refund (15% trọng số)
    const disputeCount = refundRequests.length;
    const disputeScore = Math.max(0, 15 - disputeCount * 3);

    // 4. Trạng thái Xác minh Danh tính KYC (15% trọng số)
    const kycScore = user.sellerVerificationStatus === 'APPROVED' ? 15 : (user.sellerVerificationStatus === 'PENDING' ? 7.5 : 0);

    // Điểm Uy Tín Người Bán Tổng Hợp (Scale 0 - 100)
    const sellerTrustScore = Math.min(100, Math.max(0, Math.round(starRatingScore + completionScore + disputeScore + kycScore)));
    const sellerRating = nSeller > 0 ? Number((sumSellerRatings / nSeller).toFixed(1)) : 5.0;

    // ===================== B. THUẬT TOÁN ĐIỂM UY TÍN NGƯỜI MUA (BUYER TRUST SCORE) =====================
    // 1. Bayesian Weighted Buyer Rating (40% trọng số)
    const nBuyer = buyerReviews.length;
    const sumBuyerRatings = buyerReviews.reduce((sum, r) => sum + r.rating, 0);
    const buyerBayesianRating = (C * m + sumBuyerRatings) / (C + nBuyer);
    const buyerStarScore = (buyerBayesianRating / 5.0) * 40;

    // 2. Tỷ lệ Thanh toán & Hoàn tất Đơn mua (30% trọng số)
    const totalBuyingOrders = buyingOrders.length;
    const paidBuyingOrders = buyingOrders.filter((o) => ['COMPLETED', 'DELIVERED', 'PAID', 'SHIPPED'].includes(o.status)).length;
    const buyerPaymentRate = totalBuyingOrders > 0 ? (paidBuyingOrders / totalBuyingOrders) * 100 : 100;
    const buyerPaymentScore = (buyerPaymentRate / 100) * 30;

    // 3. Chỉ số Tích cực Đặt giá & Mua hàng (15% trọng số)
    const buyerActivityBonus = Math.min(15, bidsPlacedCount * 0.5 + paidBuyingOrders * 2);

    // 4. Xác thực Thông tin Cá nhân & Địa chỉ (15% trọng số)
    const emailVerifiedBonus = user.emailVerified ? 7.5 : 0;
    const contactInfoBonus = (user.phone || user.defaultShippingAddress) ? 7.5 : 0;
    const buyerVerificationScore = emailVerifiedBonus + contactInfoBonus;

    // 5. Hình phạt Trừ điểm do Không thanh toán / Bùng cọc (-20 điểm/lần)
    const unpaidCancelledOrdersCount = buyingOrders.filter((o) => o.status === 'CANCELLED').length;
    const unpaidPenalty = unpaidCancelledOrdersCount * 20;

    // Điểm Uy Tín Người Mua Tổng Hợp (Scale 0 - 100)
    const rawBuyerScore = Math.round(buyerStarScore + buyerPaymentScore + buyerActivityBonus + buyerVerificationScore);
    const buyerTrustScore = Math.min(100, Math.max(0, rawBuyerScore - unpaidPenalty));
    const buyerRating = nBuyer > 0 ? Number((sumBuyerRatings / nBuyer).toFixed(1)) : 5.0;

    return {
      ...user,
      isBanned: user.status === 'BANNED',
      sellerRating,
      sellerReviewsCount: sellerReviews.length,
      sellerTrustScore,
      sellerMetrics: {
        bayesianRating: Number(sellerBayesianRating.toFixed(2)),
        completionRate: Number(completionRate.toFixed(1)),
        totalSellingOrders,
        completedOrders,
        disputeCount,
        kycStatus: user.sellerVerificationStatus,
      },
      buyerRating,
      buyerReviewsCount: buyerReviews.length,
      buyerTrustScore,
      buyerMetrics: {
        bayesianRating: Number(buyerBayesianRating.toFixed(2)),
        paymentRate: Number(buyerPaymentRate.toFixed(1)),
        totalBuyingOrders,
        paidBuyingOrders,
        unpaidCancelledOrdersCount,
        unpaidPenalty,
        bidsPlacedCount,
        emailVerified: user.emailVerified,
        hasShippingInfo: !!(user.phone || user.defaultShippingAddress),
      },
    };
  }

  async updateProfile(id: string, data: { name?: string; avatar?: string; emailNotifications?: boolean }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, name: true, avatar: true,
        emailNotifications: true,
        role: true, rating: true, totalReviews: true,
      },
    });
  }

  async toggleEmailNotifications(id: string, enabled: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { emailNotifications: enabled },
      select: { id: true, email: true, emailNotifications: true },
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
        select: { totalAmount: true, status: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { buyerId: userId, createdAt: { gte: startDate } },
        select: { totalAmount: true, status: true, createdAt: true },
      }),
      this.prisma.auction.findMany({
        where: { product: { ownerId: userId }, createdAt: { gte: startDate } },
        select: { id: true, createdAt: true },
      }),
      this.prisma.bid.findMany({
        where: { userId: userId, createdAt: { gte: startDate } },
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
        salesRevMap[key] = (salesRevMap[key] ?? 0) + order.totalAmount;
      }
    }

    for (const order of buyingOrders) {
      const key = getKey(new Date(order.createdAt));
      buysCountMap[key] = (buysCountMap[key] ?? 0) + 1;
      if (order.status === 'COMPLETED' || order.status === 'PAID' || order.status === 'DELIVERED') {
        spendMap[key] = (spendMap[key] ?? 0) + order.totalAmount;
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
        .reduce((s, o) => s + o.totalAmount, 0),
      salesCount: sellingOrders.length,
      purchaseSpending: buyingOrders
        .filter((o) => o.status === 'COMPLETED' || o.status === 'PAID' || o.status === 'DELIVERED')
        .reduce((s, o) => s + o.totalAmount, 0),
      buysCount: buyingOrders.length,
      auctionsCreated: myAuctions.length,
      bidsPlaced: myBids.length,
    };

    return { period, labels, series, totals };
  }
}
