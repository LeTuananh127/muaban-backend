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
        seller: { select: { id: true, name: true, avatar: true, email: true, phone: true, shopName: true, warehouseAddress: true } },
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
        buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true, defaultShippingAddress: true } },
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
        seller: { select: { id: true, name: true, avatar: true, email: true, phone: true, shopName: true, warehouseAddress: true } },
        buyer: { select: { id: true, name: true, avatar: true, email: true, phone: true, defaultShippingAddress: true } },
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

    if (order.buyerId === userId && normalizedStatus === OrderStatus.CANCELLED) {
      if (['DELIVERED', 'COMPLETED'].includes(String(order.status))) {
        throw new BadRequestException('Đơn hàng đã được giao tới nơi hoặc đã hoàn thành, bạn không thể trực tiếp từ chối/hủy đơn hàng để nhận lại tiền ngay. Nếu sản phẩm có vấn đề (lỗi, hỏng hóc, không đúng mô tả), vui lòng bấm nút "Yêu cầu hoàn tiền" kèm ảnh bằng chứng để người bán và hệ thống xác minh đối soát.');
      }
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

    const wasShipped = String(order.status) === 'SHIPPED';
    const shippingFee = Number((order as any).auction?.shippingCost ?? (order as any).shippingFee ?? 0);
    const shouldDeductShipping = wasShipped && shippingFee > 0;

    if (normalizedStatus === OrderStatus.CANCELLED) {
      // If order was already paid, refund escrow
      const escrowId = order.escrow?.id || order.escrowId;
      if (escrowId) {
        try {
          await this.escrowService.refundEscrow(escrowId, shouldDeductShipping, shippingFee);
        } catch (error) {
          console.log('Could not refund escrow:', error.message);
        }
      }

      // If unpaid PENDING order is cancelled by buyer: Forfeit deposit hold directly to seller as compensation
      if (order.status === OrderStatus.PENDING) {
        const holds = await this.prisma.walletHold.findMany({
          where: {
            wallet: { userId: order.buyerId },
            releasedAt: null,
            OR: [
              { orderId: order.id },
              { reason: { contains: `[auction_${order.auctionId}]` } },
              { reason: { contains: order.auctionId } },
            ],
          },
        });

        let totalForfeited = 0;
        for (const hold of holds) {
          totalForfeited += hold.amount;
          // Deduct from buyer
          await this.prisma.wallet.update({
            where: { id: hold.walletId },
            data: { balance: { decrement: hold.amount } },
          });
          await this.prisma.walletTransaction.create({
            data: {
              walletId: hold.walletId,
              type: 'DEBIT',
              amount: hold.amount,
              reference: `Tịch thu cọc do hủy đơn hàng #${order.id.slice(0, 8)} (order:${order.id})`,
            },
          });
          await this.prisma.walletHold.update({
            where: { id: hold.id },
            data: {
              releasedAt: new Date(),
              releasedBy: 'BUYER_CANCEL_FORFEIT',
              reason: `Tịch thu cọc chuyển bồi thường cho Người bán đơn hàng #${order.id.slice(0, 8)}`,
            },
          });
        }

        // Credit directly to seller
        if (totalForfeited > 0) {
          let sellerWallet = await this.prisma.wallet.findUnique({ where: { userId: order.sellerId } });
          if (!sellerWallet) {
            sellerWallet = await this.prisma.wallet.create({ data: { userId: order.sellerId, balance: 0 } });
          }
          await this.prisma.wallet.update({
            where: { id: sellerWallet.id },
            data: { balance: { increment: totalForfeited } },
          });
          await this.prisma.walletTransaction.create({
            data: {
              walletId: sellerWallet.id,
              type: 'CREDIT',
              amount: totalForfeited,
              reference: `Bồi thường cọc do người mua hủy đơn hàng #${order.id.slice(0, 8)} (order:${order.id})`,
            },
          });
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

      try {
        const orderShortId = orderId.slice(-6);
        const productName = updatedOrder.auction?.product?.title || 'Sản phẩm';

        if (normalizedStatus === OrderStatus.PAID) {
          await this.notificationsService.createNotification(updatedOrder.sellerId, {
            title: '💳 Đơn hàng đã được thanh toán',
            content: `Người mua đã thanh toán đơn hàng #${orderShortId} (${productName}). Vui lòng đóng gói và bàn giao cho đơn vị vận chuyển.`,
            type: 'ORDER_PAID',
            referenceId: orderId,
          });
        } else if (normalizedStatus === OrderStatus.SHIPPED) {
          const provider = shippingProvider || updatedOrder.shippingProvider || 'ĐVVC';
          const tracking = trackingCode || updatedOrder.trackingCode || '';
          await this.notificationsService.createNotification(updatedOrder.buyerId, {
            title: '🚚 Đơn hàng đang được giao',
            content: `Đơn hàng #${orderShortId} (${productName}) đã được giao cho ${provider}${tracking ? ` (Mã VĐ: ${tracking})` : ''}. Vui lòng chú ý điện thoại để nhận hàng!`,
            type: 'ORDER_SHIPPED',
            referenceId: orderId,
          });
        } else if (normalizedStatus === OrderStatus.DELIVERED) {
          await this.notificationsService.createNotification(updatedOrder.sellerId, {
            title: '📦 Người mua đã nhận được hàng',
            content: `Đơn hàng #${orderShortId} (${productName}) đã được giao thành công tới người mua.`,
            type: 'ORDER_DELIVERED',
            referenceId: orderId,
          });
          await this.notificationsService.createNotification(updatedOrder.buyerId, {
            title: '📦 Đã nhận hàng thành công',
            content: `Đơn hàng #${orderShortId} (${productName}) đã giao thành công. Bạn có 3 ngày để kiểm tra hoặc gửi yêu cầu hoàn tiền nếu có sự cố.`,
            type: 'ORDER_DELIVERED',
            referenceId: orderId,
          });
        } else if (normalizedStatus === OrderStatus.COMPLETED) {
          await this.notificationsService.createNotification(updatedOrder.sellerId, {
            title: '🎉 Đơn hàng đã hoàn tất',
            content: `Đơn hàng #${orderShortId} (${productName}) đã hoàn tất. Tiền hàng ${new Intl.NumberFormat('vi-VN').format(updatedOrder.totalAmount)} đ đã được giải ngân vào Ví của bạn!`,
            type: 'ORDER_COMPLETED',
            referenceId: orderId,
          });
          await this.notificationsService.createNotification(updatedOrder.buyerId, {
            title: '🎉 Đơn hàng đã hoàn tất',
            content: `Đơn hàng #${orderShortId} (${productName}) đã hoàn tất. Cảm ơn bạn đã tin tưởng giao dịch trên Bazaar!`,
            type: 'ORDER_COMPLETED',
            referenceId: orderId,
          });
        } else if (normalizedStatus === OrderStatus.CANCELLED) {
          if (wasShipped && shippingFee > 0) {
            const refundedToBuyer = Math.max(0, updatedOrder.totalAmount - shippingFee);
            await this.notificationsService.createNotification(updatedOrder.buyerId, {
              title: '⚠️ Đơn hàng đã bị hủy (Từ chối nhận hàng)',
              content: `Đơn hàng #${orderShortId} (${productName}) đã bị hủy do từ chối nhận. Tiền sản phẩm (${new Intl.NumberFormat('vi-VN').format(refundedToBuyer)} đ) đã được hoàn về Ví Bazaar. Phí vận chuyển (${new Intl.NumberFormat('vi-VN').format(shippingFee)} đ) được chuyển bồi thường cho Người bán.`,
              type: 'ORDER_CANCELLED',
              referenceId: orderId,
            });
            await this.notificationsService.createNotification(updatedOrder.sellerId, {
              title: '⚠️ Người mua từ chối nhận hàng',
              content: `Đơn hàng #${orderShortId} (${productName}) đã bị người mua từ chối nhận. Bạn đã được bồi thường cước phí vận chuyển (${new Intl.NumberFormat('vi-VN').format(shippingFee)} đ) vào Ví Bazaar.`,
              type: 'ORDER_CANCELLED',
              referenceId: orderId,
            });
          } else {
            await this.notificationsService.createNotification(updatedOrder.buyerId, {
              title: '⚠️ Đơn hàng đã bị hủy',
              content: `Đơn hàng #${orderShortId} (${productName}) đã bị hủy. Toàn bộ tiền thanh toán đã được hoàn về Ví Bazaar của bạn.`,
              type: 'ORDER_CANCELLED',
              referenceId: orderId,
            });
            await this.notificationsService.createNotification(updatedOrder.sellerId, {
              title: '⚠️ Đơn hàng đã bị hủy',
              content: `Đơn hàng #${orderShortId} (${productName}) đã bị hủy.`,
              type: 'ORDER_CANCELLED',
              referenceId: orderId,
            });
          }
        }
      } catch (notifErr) {
        console.error('Failed to send order status notification:', notifErr);
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

    try {
      const orderShortId = orderId.slice(-6);
      await this.notificationsService.createNotification(order.sellerId, {
        title: '⚠️ Yêu cầu Trả hàng / Hoàn tiền mới',
        content: `Người mua vừa gửi yêu cầu hoàn tiền cho đơn hàng #${orderShortId}. Lý do: "${reason.trim()}". Vui lòng kiểm tra và phản hồi.`,
        type: 'REFUND_REQUESTED',
        referenceId: orderId,
      });
    } catch (e) {
      console.log('Could not send refund request notification:', e);
    }

    return refund;
  }

  async approveRefund(sellerId: string, refundId: string, note?: string) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId }, include: { order: true } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can approve this refund');
    if (refund.status !== 'PENDING') throw new BadRequestException('Refund request is not pending');

    const orderId = refund.orderId;

    // Mark refund request approved (agree to return item). Keep money in Escrow HELD until seller confirms receiving returned product!
    await this.prisma.refundRequest.update({
      where: { id: refundId },
      data: { status: 'APPROVED', processedAt: new Date(), processedBy: sellerId, note },
    });

    // Notify buyer that return request was approved and they should ship the item back
    try {
      await this.prisma.notification.create({
        data: {
          userId: refund.buyerId,
          title: '📦 Yêu cầu trả hàng đã được chấp thuận',
          content: `Người bán đã đồng ý nhận lại hàng cho đơn hàng. Vui lòng đóng gói và gửi hàng lại cho người bán.`,
          type: 'REFUND_APPROVED',
          referenceId: orderId,
        },
      });
    } catch (err) {
      console.log('Could not create notification:', err?.message);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DISPUTED' },
    });
  }

  async confirmReturnReceived(sellerId: string, refundId: string, note?: string) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId }, include: { order: true } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can confirm returned goods');
    if (refund.status !== 'APPROVED') throw new BadRequestException('Chỉ có thể xác nhận nhận hàng sau khi đã phê duyệt yêu cầu trả hàng');

    const orderId = refund.orderId;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { escrow: true } });
    if (!order) throw new NotFoundException('Order not found');

    const isRefusal = refund.reason?.includes('[TỪ CHỐI NHẬN HÀNG]');
    const orderWithAuction = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true, auction: true },
    });
    const shippingFee = Number(orderWithAuction?.auction?.shippingCost ?? (orderWithAuction as any)?.shippingFee ?? 0);
    const shouldDeductShipping = Boolean(isRefusal && shippingFee > 0);

    // Refund escrow to buyer wallet now that seller has received returned product
    if (order.escrow) {
      try {
        await this.escrowService.refundEscrow(order.escrow.id, shouldDeductShipping, shippingFee);
      } catch (e) {
        console.warn('Escrow refund failed', e?.message ?? e);
      }
    }

    // Reopen product for auction/sale
    if (orderWithAuction?.auction?.productId) {
      try {
        await this.prisma.product.update({
          where: { id: orderWithAuction.auction.productId },
          data: { status: ProductStatus.AVAILABLE },
        });
      } catch (err) {
        console.warn('Could not reset product status', err);
      }
    }

    // Deduct 0.2 rating points from buyer if they refused delivery without valid fault from seller
    if (isRefusal) {
      try {
        const buyer = await this.prisma.user.findUnique({ where: { id: order.buyerId }, select: { rating: true } });
        if (buyer) {
          const currentRating = buyer.rating ?? 5.0;
          const newRating = Math.max(1.0, Number((currentRating - 0.2).toFixed(1)));
          await this.prisma.user.update({
            where: { id: order.buyerId },
            data: { rating: newRating },
          });
        }
      } catch (e) {
        console.warn('Could not update buyer rating', e);
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

    // Create notifications for buyer and seller
    try {
      const buyerRefundAmount = shouldDeductShipping ? Math.max(0, order.totalAmount - shippingFee) : order.totalAmount;
      await this.prisma.notification.create({
        data: {
          userId: refund.buyerId,
          title: '💰 Hoàn tiền thành công',
          content: `Người bán đã xác nhận nhận lại kiện hàng bưu phẩm hoàn đơn #${orderId.slice(-6)}. Số tiền sản phẩm ${new Intl.NumberFormat('vi-VN').format(buyerRefundAmount)} đ đã được hoàn trả về Ví Bazaar của bạn!`,
          type: 'REFUND_COMPLETED',
          referenceId: orderId,
        },
      });

      if (shouldDeductShipping) {
        await this.prisma.notification.create({
          data: {
            userId: refund.sellerId,
            title: '📦 Đã nhận lại hàng hoàn',
            content: `Bạn đã xác nhận nhận lại kiện hàng đơn #${orderId.slice(-6)}. Cước phí bồi thường vận chuyển ${new Intl.NumberFormat('vi-VN').format(shippingFee)} đ đã được cộng vào Ví Bazaar của bạn và sản phẩm đã tự động mở bán lại.`,
            type: 'REFUND_COMPLETED',
            referenceId: orderId,
          },
        });
      }
    } catch (err) {
      console.log('Could not create notification:', err?.message);
    }

    try {
      await this.prisma.refundRequest.update({
        where: { id: refundId },
        data: {
          processedAt: new Date(),
          note: refund.note ? `${refund.note} | [RETURN_CONFIRMED] Đã nhận lại hàng và hoàn tiền` : '[RETURN_CONFIRMED] Đã nhận lại hàng và hoàn tiền',
        },
      });
    } catch (err) {
      console.log('Could not update refund request note:', err?.message);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
  }

  async updateReturnShipping(buyerId: string, refundId: string, returnProvider: string, returnTrackingCode: string) {
    if (!returnProvider || !returnProvider.trim()) throw new BadRequestException('Vui lòng chọn đơn vị vận chuyển hoàn hàng');
    if (!returnTrackingCode || !returnTrackingCode.trim()) throw new BadRequestException('Vui lòng nhập mã vận đơn hoàn hàng');

    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId }, include: { order: true } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.buyerId !== buyerId) throw new ForbiddenException('Chỉ người mua mới có quyền cập nhật thông tin hoàn hàng');

    const cleanProvider = returnProvider.trim();
    const cleanTracking = returnTrackingCode.trim();
    const formattedNote = `[RETURN_SHIPPING] Provider: ${cleanProvider} | Tracking: ${cleanTracking}`;

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundId },
      data: { note: formattedNote },
    });

    try {
      await this.prisma.notification.create({
        data: {
          userId: refund.sellerId,
          title: '🚚 Người mua đã gửi hàng hoàn',
          content: `Người mua đã gửi hàng hoàn qua ${cleanProvider} - Mã vận đơn: ${cleanTracking}. Vui lòng theo dõi và xác nhận khi nhận được hàng!`,
          type: 'RETURN_SHIPPED',
          referenceId: refund.orderId,
        },
      });
    } catch (e) {
      console.log('Error creating return notification:', e);
    }

    return updated;
  }

  async rejectRefund(sellerId: string, refundId: string, note?: string, sellerImages?: string[]) {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.sellerId !== sellerId) throw new ForbiddenException('Only the seller can reject this refund');
    if (refund.status !== 'PENDING') throw new BadRequestException('Refund request is not pending');

    let formattedNote = note || 'Người bán từ chối yêu cầu hoàn tiền';
    if (sellerImages && sellerImages.length > 0) {
      formattedNote = `[SELLER_PROOF] urls: ${sellerImages.join(',')} | Reason: ${formattedNote}`;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          processedAt: new Date(),
          processedBy: sellerId,
          note: formattedNote,
        },
      });
      // Người bán từ chối -> Đơn hàng cập nhật trạng thái DISPUTED để chờ 2 bên khiếu nại hoặc Admin phân xử
      try {
        await tx.order.update({
          where: { id: refund.orderId },
          data: { status: 'DISPUTED' },
        });
      } catch (_) {}
    });

    try {
      await this.prisma.notification.create({
        data: {
          userId: refund.buyerId,
          title: '❌ Người bán từ chối yêu cầu hoàn tiền',
          content: `Người bán đã từ chối yêu cầu hoàn tiền đơn #${refund.orderId}. Lý do: "${note || 'Không đồng ý'}". Bằng chứng phản bác đã được ghi nhận. Bạn có thể khiếu nại lên Admin nếu không đồng ý.`,
          type: 'REFUND_REJECTED',
          referenceId: refund.orderId,
        },
      });
    } catch (e) {
      console.log('Error creating notification:', e);
    }

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

    let escalatedNote = refund.note || '';
    if (reason) {
      escalatedNote = `${escalatedNote} | [Khiếu nại Admin]: ${reason}`;
    }

    const mergedImages = buyerImages && buyerImages.length > 0 ? [...refund.images, ...buyerImages] : refund.images;

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          note: escalatedNote,
          images: mergedImages,
        },
      });

      await tx.order.update({
        where: { id: refund.orderId },
        data: { status: 'DISPUTED' },
      });
    });

    try {
      await this.prisma.notification.create({
        data: {
          userId: refund.sellerId,
          title: '⚖️ Người mua đã khiếu nại lên Admin',
          content: `Người mua đã gửi khiếu nại đơn hàng #${refund.orderId} lên Ban Quản Trị. Toàn bộ bằng chứng của 2 bên đang được chuyển cho Admin thẩm định và phân xử.`,
          type: 'DISPUTE_ESCALATED',
          referenceId: refund.orderId,
        },
      });
    } catch (e) {
      console.log('Error creating dispute escalation notification:', e);
    }

    return {
      message: 'Đã gửi khiếu nại lên Admin thành công. Đơn hàng đang được bảo hộ chờ Admin phán quyết.',
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
        data: { status: 'APPROVED', note: `[Phán quyết Admin - CHẤP NHẬN HOÀN TIỀN]: ${decisionReason}` },
      });
    }

    // Notify BOTH Buyer and Seller with Admin's verdict and reasoning!
    try {
      await this.prisma.notification.createMany({
        data: [
          {
            userId: order.buyerId,
            title: '⚖️ Phán quyết tranh chấp: Chấp nhận hoàn tiền',
            content: `Ban Quản Trị đã phân xử CHẤP NHẬN HOÀN TIỀN cho bạn trong đơn hàng #${order.id}. Lý do phán quyết: "${decisionReason}". Số tiền đã được hoàn 100% về Ví Bazaar của bạn.`,
            type: 'DISPUTE_RESOLVED',
            referenceId: order.id,
          },
          {
            userId: order.sellerId,
            title: '⚖️ Phán quyết tranh chấp: Hoàn tiền cho Người mua',
            content: `Ban Quản Trị đã phân xử chấp nhận yêu cầu hoàn tiền của Người mua trong đơn hàng #${order.id}. Lý do phán quyết: "${decisionReason}". Số tiền tạm giữ đã được hoàn lại cho người mua.`,
            type: 'DISPUTE_RESOLVED',
            referenceId: order.id,
          },
        ],
      });
    } catch (e) {
      console.log('Error creating dispute resolution notifications:', e);
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

    // Notify BOTH Buyer and Seller with Admin's verdict and reasoning!
    try {
      await this.prisma.notification.createMany({
        data: [
          {
            userId: order.buyerId,
            title: '⚖️ Phán quyết tranh chấp: Bác bỏ khiếu nại',
            content: `Ban Quản Trị đã BÁC BỎ khiếu nại của bạn trong đơn hàng #${order.id}. Lý do phán quyết: "${decisionReason}". Tiền tạm giữ đã được giải ngân cho Người bán.`,
            type: 'DISPUTE_RESOLVED',
            referenceId: order.id,
          },
          {
            userId: order.sellerId,
            title: '⚖️ Phán quyết tranh chấp: Giải ngân cho Bạn',
            content: `Ban Quản Trị đã phân xử BÁC BỎ khiếu nại trong đơn hàng #${order.id}. Lý do phán quyết: "${decisionReason}". Toàn bộ tiền hàng đã được giải ngân vào Ví Bazaar của bạn.`,
            type: 'DISPUTE_RESOLVED',
            referenceId: order.id,
          },
        ],
      });
    } catch (e) {
      console.log('Error creating dispute resolution notifications:', e);
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

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Chỉ người mua mới có quyền từ chối nhận hàng');
    }

    if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(order.status))) {
      throw new BadRequestException('Đơn hàng đã được giao tới nơi hoặc đã hoàn thành, bạn không thể trực tiếp từ chối nhận hàng. Nếu sản phẩm có sự cố, vui lòng gửi Yêu cầu Hoàn tiền.');
    }

    if (String(order.status) !== 'SHIPPED') {
      throw new BadRequestException('Chỉ có thể từ chối nhận hàng khi đơn hàng đang được bưu cục vận chuyển (SHIPPED).');
    }

    const formattedReason = reason?.trim() ? `[TỪ CHỐI NHẬN HÀNG KHI SHIPPER GIAO]: ${reason.trim()}` : '[TỪ CHỐI NHẬN HÀNG KHI SHIPPER GIAO]';

    // GIẢI PHÁP 2: TIỀN VẪN BỊ ĐÓNG BĂNG AN TOÀN TRONG KÉT ESCROW (HELD)!
    // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG BACK TIỀN VỀ VÍ NGAY!
    let refund = await this.prisma.refundRequest.findFirst({
      where: { orderId: order.id },
    });

    if (refund) {
      refund = await this.prisma.refundRequest.update({
        where: { id: refund.id },
        data: {
          status: 'APPROVED',
          reason: formattedReason,
          note: '[RETURNING_TO_SELLER]',
          processedAt: new Date(),
        },
      });
    } else {
      refund = await this.prisma.refundRequest.create({
        data: {
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          reason: formattedReason,
          status: 'APPROVED',
          note: '[RETURNING_TO_SELLER]',
          processedAt: new Date(),
        },
      });
    }

    // Cập nhật trạng thái đơn hàng sang DISPUTED (đang quay đầu / chờ người bán xác nhận nhận lại)
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DISPUTED' },
    });

    try {
      await this.notificationsService.createNotification(order.buyerId, {
        title: '📦 Đã ghi nhận từ chối nhận bưu phẩm',
        content: `Đơn hàng #${order.id.slice(-6)} đã chuyển sang trạng thái "Chờ bưu tá hoàn hàng về cho Người bán". Tiền sản phẩm sẽ được tự động hoàn về Ví Bazaar của bạn ngay khi Người bán xác nhận nhận lại bưu phẩm.`,
        type: 'ORDER_REFUSED',
        referenceId: order.id,
      });

      await this.notificationsService.createNotification(order.sellerId, {
        title: '⚠️ Khách hàng từ chối nhận bưu phẩm',
        content: `Người mua đã từ chối nhận đơn hàng #${order.id.slice(-6)} (Lý do: "${reason?.trim() || 'Hàng không phù hợp'}"). Kiện hàng đang trên đường chuyển hoàn về kho của bạn. Tiền ký quỹ đang được đóng băng an toàn trong két Escrow. Vui lòng bấm "Xác nhận nhận lại hàng hoàn" khi bưu phẩm về tới kho.`,
        type: 'ORDER_REFUSED',
        referenceId: order.id,
      });
    } catch (e) {
      console.error('Error sending refusal notifications:', e);
    }

    return {
      message: 'Đã báo từ chối nhận hàng. Đơn hàng đang được chuyển hoàn về kho người bán.',
      status: 'DISPUTED',
      refundId: refund.id,
    };
  }

  async disputeRefusal(sellerId: string, orderId: string, reason: string, images?: string[]) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refundRequests: true, buyer: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Chỉ người bán mới có quyền gửi khiếu nại');

    const refund = order.refundRequests?.[0];
    const formattedNote = `[SELLER_DISPUTE_REFUSAL] Người bán báo bưu tá đã giao hàng thành công: ${reason?.trim() || 'Khách đã nhận hàng nhưng ấn từ chối'}`;

    if (refund) {
      await this.prisma.refundRequest.update({
        where: { id: refund.id },
        data: {
          note: formattedNote,
          images: images && images.length > 0 ? images : refund.images,
        },
      });
    }

    // Đơn hàng tiếp tục giữ trạng thái DISPUTED, tiền tiếp tục đóng băng trong Escrow
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'DISPUTED' },
    });

    try {
      await this.notificationsService.createNotification(order.buyerId, {
        title: '⚠️ Người bán gửi khiếu nại đơn hàng',
        content: `Người bán đơn hàng #${order.id.slice(-6)} khiếu nại: "Bưu tá báo đã giao hàng thành công cho bạn". Ban Quản Trị Bazaar đang tiến hành kiểm tra bằng chứng và sẽ phạt nặng tài khoản nếu phát hiện gian lận.`,
        type: 'REFUND_REJECTED',
        referenceId: order.id,
      });

      await this.notificationsService.createNotification(order.sellerId, {
        title: '⚖️ Đã tiếp nhận khiếu nại giao vận',
        content: `Khiếu nại của bạn về đơn hàng #${order.id.slice(-6)} đã được gửi tới Ban Quản Trị Bazaar. Tiền ký quỹ tiếp tục được bảo vệ an toàn trong két Escrow cho đến khi phân định xong.`,
        type: 'REFUND_REJECTED',
        referenceId: order.id,
      });
    } catch (e) {
      console.log('Error creating dispute notification:', e);
    }

    return { message: 'Đã gửi khiếu nại lên Ban Quản Trị thành công!' };
  }
}
