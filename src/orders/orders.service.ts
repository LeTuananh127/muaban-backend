import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createOrder(buyerId: string, auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'ENDED') throw new BadRequestException('Auction has not ended yet');
    if (auction.currentWinnerId !== buyerId) throw new ForbiddenException('You did not win this auction');

    const existingOrder = await this.prisma.order.findUnique({
      where: { auctionId },
    });

    if (existingOrder) throw new BadRequestException('Order already exists for this auction');

    return this.prisma.order.create({
      data: {
        auctionId: auction.id,
        buyerId: buyerId,
        sellerId: auction.product.ownerId,
        totalAmount: auction.currentPrice + (auction.shippingCost || 0),
        status: OrderStatus.PENDING,
      },
    });
  }

  async getMyBuyingOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { buyerId: userId },
      include: {
        auction: { include: { product: true } },
        seller: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMySellingOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { sellerId: userId },
      include: {
        auction: { include: { product: true } },
        buyer: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOrderStatus(userId: string, orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Basic permission check
    if (order.sellerId !== userId && order.buyerId !== userId) {
        throw new ForbiddenException('You are not authorized to update this order');
    }

    if (order.buyerId === userId && !['PAID', 'DELIVERED', 'CANCELLED'].includes(status)) {
        throw new BadRequestException('Buyer can only update status to PAID, DELIVERED, or CANCELLED');
    }

    if (order.sellerId === userId && !['SHIPPED', 'CANCELLED'].includes(status)) {
        throw new BadRequestException('Seller can only update status to SHIPPED or CANCELLED');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
  }
}
