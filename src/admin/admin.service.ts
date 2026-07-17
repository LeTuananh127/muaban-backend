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
        product: { include: { owner: { select: { name: true, email: true } } } }
      },
      orderBy: { createdAt: 'desc' }
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
}
