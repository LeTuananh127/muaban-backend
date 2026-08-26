import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStatus, ProductStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private escrowService: EscrowService,
    private paymentsService: PaymentsService,
    private notificationsService: NotificationsService,
  ) {}

  async createOrder(buyerId: string, auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });

    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== 'ENDED') throw new BadRequestException('Auction has not ended yet');
    if (auction.currentWinnerId !== buyerId) throw new ForbiddenException('You did not win this auction');
    if (auction.reservePrice && auction.currentPrice < auction.reservePrice) {
      throw new BadRequestException('Auction ended without meeting the reserve price');
    }

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

    const hold = await this.prisma.walletHold.findFirst({
      where: {
        OR: [
          { orderId: order.id },
          { reason: { contains: `[auction_${order.auctionId}]` } },
        ],
        releasedAt: null,
      },
    });

    const depositHeldAmount = hold ? hold.amount : 0;
    const remainingAmount = Math.max(0, order.totalAmount - depositHeldAmount);

    return {
      ...order,
      depositHeldAmount,
      remainingAmount,
    };
  }

  async updateOrderStatus(userId: string, orderId: string, status: OrderStatus, shippingProvider?: string, trackingCode?: string) {
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

    if (order.buyerId === userId && !['PAID', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED'].includes(String(normalizedStatus))) {
      throw new BadRequestException('Buyer can only update status to PAID, DELIVERED, COMPLETED, CANCELLED, or DISPUTED');
    }

    if (order.sellerId === userId && !['SHIPPED', 'CANCELLED'].includes(String(normalizedStatus))) {
      throw new BadRequestException('Seller can only update status to SHIPPED or CANCELLED');
    }

    if (order.buyerId === userId && normalizedStatus === OrderStatus.CANCELLED && String(order.status) === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    if (order.sellerId === userId && normalizedStatus === OrderStatus.SHIPPED) {
      const requiredPrevStatus = isCOD ? 'PENDING' : 'PAID';
      if (String(order.status) !== requiredPrevStatus) {
        throw new BadRequestException(`Seller can only mark shipped after the order is ${requiredPrevStatus.toLowerCase()}`);
      }
      if (!shippingProvider || !shippingProvider.trim()) {
        throw new BadRequestException('Vui lòng chọn đơn vị vận chuyển!');
      }
      if (!trackingCode || !trackingCode.trim()) {
        throw new BadRequestException('Vui lòng nhập mã vận đơn!');
      }
    }

    // Handle escrow logic: Release escrow to seller IMMEDIATELY when order is COMPLETED
    if (normalizedStatus === OrderStatus.COMPLETED) {
      const escrowId = order.escrow?.id || order.escrowId;
      if (escrowId) {
        try {
          await this.escrowService.releaseEscrow(escrowId);
        } catch (err) {
          console.log('Could not release escrow:', err.message);
        }
      }
    }

    if (normalizedStatus === OrderStatus.DELIVERED && isCOD && payment && payment.status === 'PENDING') {
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

    if (normalizedStatus === OrderStatus.CANCELLED) {
      // Refund escrow when order is cancelled / refused
      const escrowId = order.escrow?.id || order.escrowId;
      if (escrowId) {
        try {
          await this.escrowService.refundEscrow(escrowId);
        } catch (error) {
          console.log('Could not refund escrow:', error.message);
        }
      }
    }

    const updateData: any = { status: normalizedStatus };

    if (normalizedStatus === OrderStatus.PAID) updateData.paidAt = new Date();
    if (normalizedStatus === OrderStatus.SHIPPED) {
      updateData.shippedAt = new Date();
      if (shippingProvider) updateData.shippingProvider = shippingProvider.trim();
      if (trackingCode) updateData.trackingCode = trackingCode.trim();
    }
    if (normalizedStatus === OrderStatus.DELIVERED) updateData.deliveredAt = new Date();
    if (normalizedStatus === OrderStatus.COMPLETED) updateData.completedAt = new Date();
    if (normalizedStatus === OrderStatus.CANCELLED) updateData.cancelledAt = new Date();

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
    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Đơn hàng đã hoàn tất và giải ngân, không thể gửi yêu cầu trả hàng / hoàn tiền.');
    }
    if (String(order.status) !== 'DELIVERED') {
      throw new BadRequestException('Chỉ có thể gửi yêu cầu Hoàn tiền khi đơn hàng ở trạng thái Đã giao hàng (DELIVERED).');
    }

    if (order.deliveredAt) {
      const hoursSinceDelivery = (Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceDelivery > 72) {
        throw new BadRequestException('Đã quá thời hạn 3 ngày (72 giờ) kể từ khi nhận hàng. Đơn hàng không còn áp dụng chính sách trả hàng / hoàn tiền.');
      }
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

  async rejectRefund(sellerId: string, refundId: string, note?: string, sellerImages?: string[]) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can reject this refund');
    if (refund.status !== 'PENDING') throw new BadRequestException('Refund request is not pending');

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          processedAt: new Date(),
          processedBy: sellerId,
          note: note || 'Người bán từ chối yêu cầu hoàn tiền',
        },
      });
      // Người bán từ chối -> Đơn hàng cập nhật trạng thái REFUND_REJECTED (Chưa chuyển ngay sang DISPUTED)
      try {
        await tx.order.update({
          where: { id: refund.orderId },
          data: { status: 'REFUND_REJECTED' as any },
        });
      } catch (_) {
        // Fallback nếu enum schema Prisma chưa có REFUND_REJECTED
      }
    });

    return {
      message: 'Người bán đã từ chối yêu cầu hoàn tiền. Người mua có quyền khiếu nại lên Admin nếu không đồng ý.',
      refundId,
    };
  }

  async escalateDisputeToAdmin(buyerId: string, refundId: string, reason?: string, buyerImages?: string[]) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.buyerId !== buyerId) throw new ForbiddenException('Only the buyer can escalate this dispute');
    if (refund.status !== 'REJECTED') {
      throw new BadRequestException('Chỉ có thể khiếu nại lên Admin sau khi Người bán từ chối yêu cầu Refund');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          note: reason ? `[Khiếu nại Admin] ${reason}` : refund.note,
          images: buyerImages && buyerImages.length > 0 ? buyerImages : refund.images,
        },
      });

      // Khi người mua không đồng ý và khiếu nại -> Đơn hàng mới chính thức đóng băng DISPUTED cho Admin xử lý
      await tx.order.update({
        where: { id: refund.orderId },
        data: { status: 'DISPUTED' },
      });
    });

    return {
      message: 'Đã gửi khiếu nại lên Admin thành công. Đơn hàng đang được đóng băng bảo hộ chờ Admin phán quyết.',
      orderId: refund.orderId,
    };
  }

  async adminApproveDispute(orderId: string, note?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DISPUTED') throw new BadRequestException('Order is not in disputed status');

    const decisionReason = note || 'Admin phán quyết Chấp nhận Refund 100% cho Người mua sau khi thẩm định bằng chứng 2 bên.';

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

    // Update refund request status and log explicit Admin decision reason
    const latestRefundRequest = await this.prisma.refundRequest.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRefundRequest) {
      await this.prisma.refundRequest.update({
        where: { id: latestRefundRequest.id },
        data: { status: 'APPROVED', note: `[Phán quyết Admin - CHẤP NHẬN REFUND]: ${decisionReason}` },
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

    const decisionReason = note || 'Admin phán quyết Bác bỏ Khiếu nại, Giải ngân cho Người bán sau khi thẩm định bằng chứng 2 bên.';

    // Release escrow to seller
    if (order.escrow) {
      try {
        await this.escrowService.releaseEscrow(order.escrow.id);
      } catch (e) {
        console.warn('Escrow release failed', e?.message ?? e);
      }
    }

    // Update refund request status to rejected with explicit Admin decision reason
    const latestRefundRequest = await this.prisma.refundRequest.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (latestRefundRequest) {
      await this.prisma.refundRequest.update({
        where: { id: latestRefundRequest.id },
        data: { note: `[Phán quyết Admin - BÁC BỎ KHIẾU NẠI]: ${decisionReason}` },
      });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async refuseOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        auction: { include: { product: true } },
        buyer: true,
        seller: true,
        escrow: true,
        payment: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You do not have permission to handle this order refusal');
    }

    if (['COMPLETED', 'CANCELLED'].includes(String(order.status))) {
      throw new BadRequestException('Order is already completed or cancelled');
    }

    const shippingCompensation = order.auction.shippingCost && order.auction.shippingCost > 0
      ? order.auction.shippingCost
      : 30000;

    let refundedToBuyer = 0;
    let compensatedToSeller = 0;

    await this.prisma.$transaction(async (tx) => {
      if (order.escrow && (order.escrow.status === 'HELD' || order.escrow.status === 'RELEASED')) {
        const totalAmount = order.totalAmount;
        compensatedToSeller = Math.min(shippingCompensation, totalAmount);
        refundedToBuyer = Math.max(0, totalAmount - compensatedToSeller);

        await tx.escrow.update({
          where: { id: order.escrow.id },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        });

        if (compensatedToSeller > 0) {
          let sellerWallet = await tx.wallet.findUnique({ where: { userId: order.sellerId } });
          if (!sellerWallet) {
            sellerWallet = await tx.wallet.create({ data: { userId: order.sellerId, balance: 0 } });
          }
          await tx.wallet.update({
            where: { id: sellerWallet.id },
            data: { balance: { increment: compensatedToSeller } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: sellerWallet.id,
              type: 'CREDIT',
              amount: compensatedToSeller,
              reference: `refusal_compensation:order:${order.id}`,
            },
          });
        }

        if (refundedToBuyer > 0) {
          let buyerWallet = await tx.wallet.findUnique({ where: { userId: order.buyerId } });
          if (!buyerWallet) {
            buyerWallet = await tx.wallet.create({ data: { userId: order.buyerId, balance: 0 } });
          }
          await tx.wallet.update({
            where: { id: buyerWallet.id },
            data: { balance: { increment: refundedToBuyer } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: buyerWallet.id,
              type: 'REFUND',
              amount: refundedToBuyer,
              reference: `refusal_refund:order:${order.id}`,
            },
          });
        }
      }

      const currentRating = order.buyer.rating ?? 5.0;
      const newRating = Math.max(1.0, Number((currentRating - 0.5).toFixed(1)));
      await tx.user.update({
        where: { id: order.buyerId },
        data: { rating: newRating },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      if (order.auction && order.auction.productId) {
        await tx.product.update({
          where: { id: order.auction.productId },
          data: { status: ProductStatus.AVAILABLE },
        });
      }
    });

    try {
      await this.notificationsService.createNotification(order.buyerId, {
        title: 'Xác nhận Từ chối nhận hàng',
        content: `Đơn hàng #${order.id.slice(-6)} đã bị hủy do từ chối nhận hàng. Số tiền ${refundedToBuyer.toLocaleString('vi-VN')} đ đã được hoàn về Ví của bạn (đã trừ ${compensatedToSeller.toLocaleString('vi-VN')} đ phí vận chuyển bồi thường cho Người bán). Điểm uy tín bị trừ 0.5 điểm.`,
        type: 'ORDER_REFUSED',
        referenceId: order.id,
      });

      await this.notificationsService.createNotification(order.sellerId, {
        title: 'Người mua Từ chối nhận hàng',
        content: `Người mua đã từ chối nhận đơn hàng #${order.id.slice(-6)}. Ví của bạn đã được bồi thường ${compensatedToSeller.toLocaleString('vi-VN')} đ phí vận chuyển và sản phẩm đã được tự động mở bán lại.`,
        type: 'ORDER_REFUSED',
        referenceId: order.id,
      });
    } catch (e) {
      console.error('Error sending refusal notifications:', e);
    }

    return {
      message: 'Đã xử lý từ chối nhận hàng thành công',
      refundedToBuyer,
      compensatedToSeller,
    };
  }
}
