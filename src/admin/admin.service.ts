import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ===================== QUẢN LÝ USER =====================
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, 
        status: true, rating: true, createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async toggleBanUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const newStatus = user.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: newStatus }
    });
  }

  async getPendingSellerVerifications() {
    return this.prisma.user.findMany({
      where: { sellerVerificationStatus: 'PENDING' },
      select: {
        id: true,
        email: true,
        name: true,
        shopName: true,
        idNumber: true,
        idImages: true,
        warehouseAddress: true,
        bankAccount: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewSellerVerification(userId: string, action: 'APPROVE' | 'REJECT') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        sellerVerificationStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      },
      select: {
        id: true,
        email: true,
        name: true,
        sellerVerificationStatus: true,
      },
    });
  }

  // ===================== QUẢN LÝ LISTING =====================
  async getAllListings() {
    return this.prisma.auction.findMany({
      include: {
        product: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            category: { select: { id: true, name: true } },
          },
        },
        currentWinner: { select: { id: true, name: true, email: true } },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingListings() {
    return this.prisma.auction.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: {
        product: {
          include: {
            owner: { select: { id: true, name: true, email: true } },
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewListing(auctionId: string, action: 'APPROVE' | 'REJECT') {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');

    return this.prisma.$transaction(async (tx) => {
      const updatedAuction = await tx.auction.update({
        where: { id: auctionId },
        data: {
          status: action === 'APPROVE' ? 'ACTIVE' : 'CANCELLED',
        },
      });

      if (action === 'REJECT') {
        await tx.product.update({
          where: { id: auction.productId },
          data: { status: 'AVAILABLE' },
        });
      }

      return updatedAuction;
    });
  }

  async deleteListing(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new NotFoundException('Auction not found');
    
    // Xóa theo tầng cascade từ Auction. Xoá Product và các relation khác đi kèm
    await this.prisma.product.delete({
       where: { id: auction.productId }
    });

    return { message: 'Listing deleted successfully' };
  }

  // ===================== QUẢN LÝ REPORT / ABUSE =====================
  async getAllReports() {
    return this.prisma.report.findMany({
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        reportedUser: { select: { id: true, name: true, email: true, status: true } },
        auction: { select: { id: true, product: { select: { title: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolveReport(reportId: string, status: 'RESOLVED' | 'REJECTED') {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    return this.prisma.report.update({
      where: { id: reportId },
      data: { status }
    });
  }

  async getDisputes() {
    return this.prisma.order.findMany({
      where: { status: 'DISPUTED' },
      include: {
        buyer: { select: { id: true, name: true, email: true, phone: true } },
        seller: { select: { id: true, name: true, email: true, phone: true } },
        auction: { include: { product: true } },
        refundRequests: { orderBy: { createdAt: 'desc' } },
        payment: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getStats() {
    const totalUsers = await this.prisma.user.count();
    const activeListings = await this.prisma.auction.count({ where: { status: 'ACTIVE' } });
    const pendingReports = await this.prisma.report.count({ where: { status: 'PENDING' } });
    const pendingKYC = await this.prisma.user.count({ where: { sellerVerificationStatus: 'PENDING' } });

    const feeTransactions = await this.prisma.walletTransaction.findMany({
      where: { type: 'FEE' },
      select: { amount: true },
    });
    const totalPlatformFee = feeTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalUsers,
      activeListings,
      pendingReports,
      pendingKYC,
      totalPlatformFee,
    };
  }

  // ===================== THỐNG KÊ BIỂU ĐỒ =====================
  async getAnalytics(period: 'day' | 'month' | 'year' = 'month') {
    // Xác định khoảng thời gian cần lấy
    const now = new Date();
    let startDate: Date;
    let points: number;

    if (period === 'day') {
      // 30 ngày gần nhất
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      points = 30;
    } else if (period === 'month') {
      // 12 tháng gần nhất
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      points = 12;
    } else {
      // 5 năm gần nhất
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 4);
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      points = 5;
    }

    // Hàm tạo key nhóm theo period
    const getKey = (date: Date): string => {
      if (period === 'day') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } else if (period === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        return `${date.getFullYear()}`;
      }
    };

    // Tạo tất cả labels từ startDate tới now
    const labels: string[] = [];
    const d = new Date(startDate);
    for (let i = 0; i < points; i++) {
      labels.push(getKey(d));
      if (period === 'day') d.setDate(d.getDate() + 1);
      else if (period === 'month') d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
    }

    // Fetch raw data song song
    const [users, auctions, orders, payments] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
      }),
      this.prisma.auction.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate },
        },
        select: { amount: true, createdAt: true },
      }),
    ]);

    // Group by period key
    const groupCount = (items: { createdAt: Date }[]) => {
      const map: Record<string, number> = {};
      for (const item of items) {
        const key = getKey(new Date(item.createdAt));
        map[key] = (map[key] ?? 0) + 1;
      }
      return map;
    };

    const groupRevenue = (items: { amount: number; createdAt: Date }[]) => {
      const map: Record<string, number> = {};
      for (const item of items) {
        const key = getKey(new Date(item.createdAt));
        map[key] = (map[key] ?? 0) + item.amount;
      }
      return map;
    };

    const userMap = groupCount(users);
    const auctionMap = groupCount(auctions);
    const orderMap = groupCount(orders);
    const revenueMap = groupRevenue(payments);

    // Build chart series aligned to labels
    const series = labels.map((label) => ({
      label,
      newUsers: userMap[label] ?? 0,
      newAuctions: auctionMap[label] ?? 0,
      newOrders: orderMap[label] ?? 0,
      revenue: revenueMap[label] ?? 0,
    }));

    // Tổng tích lũy
    const totals = {
      users: users.length,
      auctions: auctions.length,
      orders: orders.length,
      revenue: payments.reduce((s, p) => s + p.amount, 0),
    };

    return { period, labels, series, totals };
  }
}
