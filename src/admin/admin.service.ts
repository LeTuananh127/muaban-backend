import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ===================== QUẢN LÝ USER =====================
  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        rating: true,
        shopName: true,
        sellerVerificationStatus: true,
        customFeePercent: true,
        createdAt: true,
        _count: {
          select: {
            bids: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const salesCounts = await this.prisma.order.groupBy({
      by: ['sellerId'],
      _count: { id: true },
    });

    const salesMap = new Map<string, number>();
    for (const item of salesCounts) {
      salesMap.set(item.sellerId, item._count.id);
    }

    return users.map((u) => {
      const dateObj = new Date(u.createdAt);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const formattedJoinDate = `${day}/${month}/${year}`;

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone || 'Chưa cập nhật',
        role: u.role,
        status: u.status,
        rating: u.rating ?? 5.0,
        shopName: u.shopName,
        sellerVerificationStatus: u.sellerVerificationStatus,
        customFeePercent: u.customFeePercent,
        createdAt: u.createdAt,
        joinDate: formattedJoinDate,
        totalBids: u._count.bids,
        totalSales: salesMap.get(u.id) ?? 0,
      };
    });
  }

  async updateSellerFeeRate(userId: string, customFeePercent: number | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const feeValue = customFeePercent === null || customFeePercent === undefined || isNaN(Number(customFeePercent))
      ? null
      : Number(customFeePercent);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        customFeePercent: feeValue,
      },
      select: {
        id: true,
        email: true,
        name: true,
        customFeePercent: true,
      },
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

  // ===================== NHẬT KÝ HỆ THỐNG / AUDIT LOGS =====================
  async getSystemLogs(query: { category?: string; level?: string; search?: string; limit?: number }) {
    const limit = Math.min(query.limit || 150, 300);

    // 1. Fetch wallet transactions (Finance logs)
    const transactions = await this.prisma.walletTransaction.findMany({
      include: {
        wallet: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    // 2. Fetch recent orders & their transitions (Order logs)
    const orders = await this.prisma.order.findMany({
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        auction: { include: { product: true } },
        refundRequests: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    // 3. Fetch recent bids (Auction logs)
    const bids = await this.prisma.bid.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        auction: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 4. Fetch reports & security events (Security logs)
    const reports = await this.prisma.report.findMany({
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        reportedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const verifications = await this.prisma.user.findMany({
      where: {
        sellerVerificationStatus: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        shopName: true,
        sellerVerificationStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const rawLogs: any[] = [];

    // Map transactions
    for (const t of transactions) {
      const isRefund = t.type === 'REFUND' || t.reference?.includes('Hoàn tiền');
      const isCompensation = t.reference?.includes('Bồi thường');
      
      let level = 'INFO';
      if (isRefund || isCompensation) level = 'SUCCESS';
      else if (t.type === 'FEE') level = 'INFO';
      else if (t.amount > 10000000) level = 'WARNING';

      rawLogs.push({
        id: `tx_${t.id}`,
        timestamp: t.createdAt.toISOString(),
        level,
        category: 'FINANCE',
        action: `WALLET_${t.type}`,
        actor: t.wallet?.user ? {
          id: t.wallet.user.id,
          name: t.wallet.user.name,
          email: t.wallet.user.email,
          role: t.wallet.user.role,
        } : { name: 'Hệ thống', role: 'SYSTEM' },
        message: `${t.wallet?.user?.name || 'Tài khoản'} thực hiện giao dịch ${t.type} số tiền ${new Intl.NumberFormat('vi-VN').format(t.amount)} đ. Nội dung: "${t.reference || 'Không có ghi chú'}"`,
        metadata: {
          transactionId: t.id,
          walletId: t.walletId,
          type: t.type,
          amount: t.amount,
          reference: t.reference,
        },
      });
    }

    // Map orders
    for (const o of orders) {
      let level = 'INFO';
      if (o.status === 'COMPLETED') level = 'SUCCESS';
      else if (o.status === 'CANCELLED' || o.status === 'DISPUTED') level = 'WARNING';

      let extraDesc = '';
      if (o.refundRequests && o.refundRequests.length > 0) {
        extraDesc = ` (Có yêu cầu hoàn tiền/khiếu nại: "${o.refundRequests[0].reason || ''}")`;
      }

      rawLogs.push({
        id: `ord_${o.id}_${o.updatedAt.getTime()}`,
        timestamp: o.updatedAt.toISOString(),
        level,
        category: 'ORDER',
        action: `ORDER_${o.status}`,
        actor: {
          id: o.buyerId,
          name: o.buyer?.name,
          email: o.buyer?.email,
          role: 'BUYER',
        },
        target: {
          type: 'ORDER',
          id: o.id,
          title: o.auction?.product?.title || 'Sản phẩm đấu giá',
        },
        message: `Đơn hàng #${o.id.slice(-6)} (${o.auction?.product?.title || 'Sản phẩm'}) cập nhật trạng thái sang ${o.status}. Người bán: ${o.seller?.name || 'N/A'}, Người mua: ${o.buyer?.name || 'N/A'}. Tổng tiền: ${new Intl.NumberFormat('vi-VN').format(o.totalAmount)} đ.${extraDesc}`,
        metadata: {
          orderId: o.id,
          status: o.status,
          totalAmount: o.totalAmount,
          sellerName: o.seller?.name,
          buyerName: o.buyer?.name,
          shippingProvider: o.shippingProvider,
          trackingCode: o.trackingCode,
        },
      });
    }

    // Map bids
    for (const b of bids) {
      rawLogs.push({
        id: `bid_${b.id}`,
        timestamp: b.createdAt.toISOString(),
        level: 'INFO',
        category: 'AUCTION',
        action: 'BID_PLACED',
        actor: {
          id: b.userId,
          name: b.user?.name,
          email: b.user?.email,
          role: 'BIDDER',
        },
        target: {
          type: 'AUCTION',
          id: b.auctionId,
          title: b.auction?.product?.title || 'Phiên đấu giá',
        },
        message: `Người dùng ${b.user?.name || 'Ẩn danh'} (${b.user?.email}) đặt giá ${new Intl.NumberFormat('vi-VN').format(b.amount)} đ cho sản phẩm "${b.auction?.product?.title || 'Sản phẩm'}"`,
        metadata: {
          bidId: b.id,
          auctionId: b.auctionId,
          amount: b.amount,
        },
      });
    }

    // Map security / reports
    for (const r of reports) {
      rawLogs.push({
        id: `rep_${r.id}`,
        timestamp: r.createdAt.toISOString(),
        level: r.status === 'PENDING' ? 'WARNING' : 'INFO',
        category: 'SECURITY',
        action: `ABUSE_REPORT_${r.status}`,
        actor: {
          id: r.reporterId,
          name: r.reporter?.name,
          email: r.reporter?.email,
          role: 'USER',
        },
        message: `Báo cáo vi phạm #${r.id.slice(-6)} từ ${r.reporter?.name}: "${r.reason}". Trạng thái: ${r.status}`,
        metadata: {
          reportId: r.id,
          reportedUserId: r.reportedUserId,
          reason: r.reason,
          status: r.status,
        },
      });
    }

    // Map KYC verifications
    for (const v of verifications) {
      rawLogs.push({
        id: `kyc_${v.id}`,
        timestamp: v.createdAt.toISOString(),
        level: v.sellerVerificationStatus === 'APPROVED' ? 'SUCCESS' : v.sellerVerificationStatus === 'REJECTED' ? 'ERROR' : 'WARNING',
        category: 'SECURITY',
        action: `SELLER_KYC_${v.sellerVerificationStatus}`,
        actor: {
          id: v.id,
          name: v.name,
          email: v.email,
          role: 'SELLER',
        },
        message: `Hồ sơ xác thực CCCD/Seller KYC của ${v.name} (${v.email}). Trạng thái: ${v.sellerVerificationStatus}`,
        metadata: {
          userId: v.id,
          shopName: v.shopName,
          status: v.sellerVerificationStatus,
        },
      });
    }

    // Sort all combined logs by timestamp desc
    rawLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate overall metric counts before filter
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    let recent24h = 0;
    const countsByLevel = { INFO: 0, SUCCESS: 0, WARNING: 0, ERROR: 0 };
    const countsByCategory = { ORDER: 0, FINANCE: 0, AUCTION: 0, SECURITY: 0, SYSTEM: 0 };

    for (const item of rawLogs) {
      if (new Date(item.timestamp).getTime() >= oneDayAgo) {
        recent24h++;
      }
      if (countsByLevel[item.level] !== undefined) {
        countsByLevel[item.level]++;
      }
      if (countsByCategory[item.category] !== undefined) {
        countsByCategory[item.category]++;
      }
    }

    // Filter by query params
    let filtered = rawLogs;
    if (query.category && query.category !== 'ALL') {
      const targetCat = query.category.toUpperCase();
      filtered = filtered.filter((l) => l.category === targetCat);
    }
    if (query.level && query.level !== 'ALL') {
      const targetLvl = query.level.toUpperCase();
      filtered = filtered.filter((l) => l.level === targetLvl);
    }
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      filtered = filtered.filter((l) =>
        l.message?.toLowerCase().includes(q) ||
        l.action?.toLowerCase().includes(q) ||
        l.actor?.name?.toLowerCase().includes(q) ||
        l.actor?.email?.toLowerCase().includes(q) ||
        l.id?.toLowerCase().includes(q)
      );
    }

    const paged = filtered.slice(0, limit);

    return {
      logs: paged,
      total: filtered.length,
      countsByLevel,
      countsByCategory,
      recent24h,
    };
  }
}
