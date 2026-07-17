import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private escrowService: EscrowService,
    private paymentsService: PaymentsService,
  ) {}

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
    const orders = await this.prisma.order.findMany({
      where: { buyerId: userId },
      include: {
        auction: { include: { product: true } },
        seller: { select: { id: true, name: true, avatar: true } },
        refundRequests: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const order of orders) {
      if (!order.payment) {
        const payment = await this.prisma.payment.findFirst({
          where: { orderId: order.id },
        });
        if (payment) {
          (order as any).payment = payment;
        }
      }
    }

    return orders;
  }

  async getMySellingOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { sellerId: userId },
      include: {
        auction: { include: { product: true } },
        buyer: { select: { id: true, name: true, avatar: true } },
        refundRequests: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const order of orders) {
      if (!order.payment) {
        const payment = await this.prisma.payment.findFirst({
          where: { orderId: order.id },
        });
        if (payment) {
          (order as any).payment = payment;
        }
      }
    }

    return orders;
  }

  async getOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        auction: { include: { product: true } },
        seller: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
        buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
        payment: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You are not authorized to view this order');
    }

    if (!order.payment) {
      const payment = await this.prisma.payment.findFirst({
        where: { orderId: order.id },
      });
      if (payment) {
        (order as any).payment = payment;
      }
    }

    return order;
  }

  async updateOrderStatus(userId: string, orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Basic permission check
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException('You are not authorized to update this order');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
    });
    const isCOD = payment?.method === 'CASH_ON_DELIVERY';

    const normalizedStatus = String(status).toUpperCase() as OrderStatus;

    if (order.buyerId === userId && !['PAID', 'DELIVERED', 'CANCELLED'].includes(normalizedStatus)) {
      throw new BadRequestException('Buyer can only update status to PAID, DELIVERED, or CANCELLED');
    }

    if (order.sellerId === userId && !['SHIPPED', 'CANCELLED'].includes(normalizedStatus)) {
      throw new BadRequestException('Seller can only update status to SHIPPED or CANCELLED');
    }

    if (order.buyerId === userId && normalizedStatus === 'CANCELLED' && String(order.status) !== 'PENDING') {
      throw new BadRequestException('Buyer can only cancel before payment');
    }

    if (order.sellerId === userId && normalizedStatus === 'SHIPPED') {
      const requiredPrevStatus = isCOD ? 'PENDING' : 'PAID';
      if (String(order.status) !== requiredPrevStatus) {
        throw new BadRequestException(`Seller can only mark shipped after the order is ${requiredPrevStatus.toLowerCase()}`);
      }
    }

    // Handle escrow logic
    if (normalizedStatus === 'DELIVERED' && order.escrow) {
      // Release escrow when order is delivered
      await this.escrowService.releaseEscrow(order.escrow.id);
    }

    if (normalizedStatus === 'DELIVERED' && isCOD && payment && payment.status === 'PENDING') {
      // For COD, automatically complete payment when delivered
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          transactionId: `COD_DELIVERY_${Date.now()}`,
          completedAt: new Date(),
        },
      });
    }

    if (normalizedStatus === 'CANCELLED' && order.escrow) {
      // Refund escrow when order is cancelled
      try {
        await this.escrowService.refundEscrow(order.escrow.id);
      } catch (error) {
        // If escrow is not in HELD status, continue
        console.log('Could not refund escrow:', error.message);
      }
    }

    const updateData: any = { status: normalizedStatus };

    if (normalizedStatus === 'PAID') updateData.paidAt = new Date();
    if (normalizedStatus === 'SHIPPED') updateData.shippedAt = new Date();
    if (normalizedStatus === 'DELIVERED') updateData.deliveredAt = new Date();
    if (normalizedStatus === 'COMPLETED') updateData.completedAt = new Date();
    if (normalizedStatus === 'CANCELLED') updateData.cancelledAt = new Date();

    try {
      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
          auction: { include: { product: true } },
          seller: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
          buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true } },
          payment: true,
        },
      });

      if (!updatedOrder.payment) {
        const payment = await this.prisma.payment.findFirst({
          where: { orderId: updatedOrder.id },
        });
        if (payment) {
          (updatedOrder as any).payment = payment;
        }
      }

      return updatedOrder;
    } catch (error) {
      console.error('Failed to update order status', { orderId, userId, status: normalizedStatus, error });
      throw new BadRequestException('Unable to update order status');
    }
  }

  async requestRefund(userId: string, orderId: string, reason?: string, images?: string[]) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Only buyer can request refund');
    if (order.status === 'CANCELLED') throw new BadRequestException('Cannot request refund for cancelled order');
    if (!['PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(String(order.status))) {
      throw new BadRequestException('Refund can only be requested after payment');
    }
    if (!reason || !reason.trim()) throw new BadRequestException('Refund reason is required');

    const existingPendingRefund = await this.prisma.refundRequest.findFirst({
      where: {
        orderId,
        status: 'PENDING',
      },
    });

    if (existingPendingRefund) {
      throw new BadRequestException('Refund request already pending for this order');
    }

    // Create a refund request record (pending approval by seller)
    const refund = await this.prisma.refundRequest.create({
      data: {
        orderId,
        buyerId: userId,
        sellerId: order.sellerId,
        reason: reason.trim(),
        images: images || [],
        status: 'PENDING',
      },
    });

    return refund;
  }

  async approveRefund(sellerId: string, refundId: string, note?: string) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId }, include: { order: true } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can approve this refund');
    if (refund.status !== 'PENDING') throw new BadRequestException('Refund request is not pending');

    const orderId = refund.orderId;

    // Try to refund escrow and payment
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { escrow: true } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.escrow) {
      try {
        await this.escrowService.refundEscrow(order.escrow.id);
      } catch (e) {
        console.warn('Escrow refund failed', e?.message ?? e);
      }
    }

    const payment = await this.prisma.payment.findFirst({ where: { orderId } });
    if (payment) {
      // If payment method was COD and already completed, we chargeback the seller and refund the buyer's wallet
      if (payment.method === 'CASH_ON_DELIVERY' && payment.status === 'COMPLETED') {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Deduct from seller
            let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
            if (!sellerWallet) {
              sellerWallet = await tx.wallet.create({ data: { userId: order.sellerId, balance: 0 } });
            }
            await tx.wallet.update({
              where: { id: sellerWallet.id },
              data: { balance: { decrement: payment.amount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: sellerWallet.id,
                type: 'DEBIT',
                amount: payment.amount,
                reference: `cod_refund_chargeback:${order.id}`,
              },
            });

            // Credit to buyer
            let buyerWallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
            if (!buyerWallet) {
              buyerWallet = await tx.wallet.create({ data: { userId: order.buyerId, balance: 0 } });
            }
            await tx.wallet.update({
              where: { id: buyerWallet.id },
              data: { balance: { increment: payment.amount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: buyerWallet.id,
                type: 'REFUND',
                amount: payment.amount,
                reference: `cod_refund:${order.id}`,
              },
            });
          });
        } catch (e) {
          console.warn('COD wallet chargeback failed', e?.message ?? e);
        }
      }

      try {
        await this.paymentsService.refundPayment(payment.id);
      } catch (e) {
        console.warn('Payment refund failed', e?.message ?? e);
      }
    }

    // mark refund request approved and update order
    await this.prisma.refundRequest.update({ where: { id: refundId }, data: { status: 'APPROVED', processedAt: new Date(), processedBy: sellerId, note } });

    return this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
  }

  async rejectRefund(sellerId: string, refundId: string, note?: string) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can reject this refund');
    if (refund.status !== 'PENDING') throw new BadRequestException('Refund request is not pending');

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundId },
        data: { status: 'REJECTED', processedAt: new Date(), processedBy: sellerId, note }
      });
      await tx.order.update({
        where: { id: refund.orderId },
        data: { status: 'DISPUTED' }
      });
    });

    return { success: true };
  }

  async adminApproveDispute(orderId: string, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DISPUTED') throw new BadRequestException('Order is not in disputed status');

    // Refund escrow
    if (order.escrow) {
      try {
        await this.escrowService.refundEscrow(order.escrow.id);
      } catch (e) {
        console.warn('Escrow refund failed', e?.message ?? e);
      }
    }

    const payment = await this.prisma.payment.findFirst({ where: { orderId } });
    if (payment) {
      if (payment.method === 'CASH_ON_DELIVERY' && payment.status === 'COMPLETED') {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Deduct from seller
            let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
            if (!sellerWallet) {
              sellerWallet = await tx.wallet.create({ data: { userId: order.sellerId, balance: 0 } });
            }
            await tx.wallet.update({
              where: { id: sellerWallet.id },
              data: { balance: { decrement: payment.amount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: sellerWallet.id,
                type: 'DEBIT',
                amount: payment.amount,
                reference: `dispute_refund_chargeback:${order.id}`,
              },
            });

            // Credit to buyer
            let buyerWallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
            if (!buyerWallet) {
              buyerWallet = await tx.wallet.create({ data: { userId: order.buyerId, balance: 0 } });
            }
            await tx.wallet.update({
              where: { id: buyerWallet.id },
              data: { balance: { increment: payment.amount } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: buyerWallet.id,
                type: 'REFUND',
                amount: payment.amount,
                reference: `dispute_refund:${order.id}`,
              },
            });
          });
        } catch (e) {
          console.warn('Dispute COD wallet chargeback failed', e?.message ?? e);
        }
      }

      try {
        await this.paymentsService.refundPayment(payment.id);
      } catch (e) {
        console.warn('Dispute Payment refund failed', e?.message ?? e);
      }
    }

    // Update refund request status if any
    const latestRefundRequest = await this.prisma.refundRequest.findFirst({
      where: { orderId, status: 'REJECTED' },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRefundRequest) {
      await this.prisma.refundRequest.update({
        where: { id: latestRefundRequest.id },
        data: { status: 'APPROVED', note: `Admin phân xử hoàn tiền: ${note ?? ''}` },
      });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  async adminRejectDispute(orderId: string, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DISPUTED') throw new BadRequestException('Order is not in disputed status');

    // Release escrow to seller
    if (order.escrow) {
      try {
        await this.escrowService.releaseEscrow(order.escrow.id);
      } catch (e) {
        console.warn('Escrow release failed', e?.message ?? e);
      }
    }

    // Update refund request status to rejected
    const latestRefundRequest = await this.prisma.refundRequest.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRefundRequest) {
      await this.prisma.refundRequest.update({
        where: { id: latestRefundRequest.id },
        data: { note: `Admin bác bỏ khiếu nại: ${note ?? ''}` },
      });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
