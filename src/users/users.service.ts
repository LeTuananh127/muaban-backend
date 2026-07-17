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
    return user;
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
}
