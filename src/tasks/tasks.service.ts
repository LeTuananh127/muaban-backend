import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { getPlatformFeePercent } from '../escrow/escrow.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
  ) {}

  // Cron job chạy mỗi phút để check và đóng các phiên đấu giá đã quá hạn
  @Cron(CronExpression.EVERY_MINUTE)
  async handleEndedAuctions() {
    this.logger.debug('Checking for ended auctions...');

    const now = new Date();

    const endedAuctions = await this.prisma.auction.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { lte: now },
      },
      include: {
        product: true,
        currentWinner: true,
      },
    });

    if (endedAuctions.length === 0) return;

    for (const auction of endedAuctions) {
      this.logger.log(`Ending auction ${auction.id}...`);

      const hasWinner = auction.currentWinnerId && 
        (!auction.reservePrice || auction.currentPrice >= auction.reservePrice);

      await this.prisma.$transaction(async (tx) => {
        // Đóng auction lại
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: 'ENDED' },
        });

        // Cập nhật trạng thái Product
        await tx.product.update({
          where: { id: auction.productId },
          data: { status: hasWinner ? 'SOLD' : 'AVAILABLE' },
        });
      });

      // Nếu có người thắng thực sự (đạt giá dự trữ), tự động tạo Order tương ứng và thông báo cho cả 2 bên
      if (hasWinner && auction.currentWinnerId) {
        try {
          await this.ordersService.createOrder(auction.currentWinnerId, auction.id);
          this.logger.log(`Created auto-order for auction ${auction.id}`);
        } catch (error) {
          this.logger.error(`Failed to create order for ${auction.id}: ${error.message}`);
        }

        try {
          // Notify winner
          await this.notificationsService.createNotification(auction.currentWinnerId, {
            title: 'Chúc mừng bạn đã thắng đấu giá!',
            content: `Chúc mừng! Bạn đã thắng đấu giá sản phẩm "${auction.product.title}" với mức giá: ${auction.currentPrice.toLocaleString('vi-VN')} đ. Hãy hoàn tất thanh toán.`,
            type: 'AUCTION_ENDED_WINNER',
            referenceId: auction.id,
          });

          // Notify seller
          await this.notificationsService.createNotification(auction.product.ownerId, {
            title: 'Sản phẩm đã bán thành công!',
            content: `Phiên đấu giá sản phẩm "${auction.product.title}" của bạn đã kết thúc. Người thắng cuộc là ${auction.currentWinner?.name || 'Thành viên'} với mức giá ${auction.currentPrice.toLocaleString('vi-VN')} đ.`,
            type: 'AUCTION_ENDED_WINNER',
            referenceId: auction.id,
          });
        } catch (error) {
          this.logger.error(`Failed to send end auction winner notifications: ${error.message}`);
        }
      } else {
        // Không có người thắng (không có ai bid hoặc bid không đạt giá dự trữ)
        if (auction.currentWinnerId) {
          // Trường hợp có đặt giá nhưng không đạt giá tối thiểu
          try {
            // Notify seller
            await this.notificationsService.createNotification(auction.product.ownerId, {
              title: 'Đấu giá kết thúc không đạt giá tối thiểu',
              content: `Phiên đấu giá sản phẩm "${auction.product.title}" đã kết thúc. Mức giá cao nhất đạt được là ${auction.currentPrice.toLocaleString('vi-VN')} đ, chưa đạt mức giá tối thiểu (Giá dự trữ: ${auction.reservePrice?.toLocaleString('vi-VN')} đ) bạn mong muốn.`,
              type: 'AUCTION_ENDED_NO_BIDS',
              referenceId: auction.id,
            });

            // Notify bidder
            await this.notificationsService.createNotification(auction.currentWinnerId, {
              title: 'Phiên đấu giá kết thúc không thành công',
              content: `Phiên đấu giá sản phẩm "${auction.product.title}" đã kết thúc. Lượt đặt giá cao nhất của bạn (${auction.currentPrice.toLocaleString('vi-VN')} đ) chưa đạt mức giá tối thiểu do người bán yêu cầu.`,
              type: 'AUCTION_ENDED_NO_BIDS',
              referenceId: auction.id,
            });
          } catch (error) {
            this.logger.error(`Failed to send end auction below-reserve notifications: ${error.message}`);
          }
        } else {
          // Trường hợp không có ai đấu giá
          try {
            await this.notificationsService.createNotification(auction.product.ownerId, {
              title: 'Đấu giá kết thúc không có người mua',
              content: `Phiên đấu giá sản phẩm "${auction.product.title}" của bạn đã kết thúc nhưng không có ai tham gia đặt giá.`,
              type: 'AUCTION_ENDED_NO_BIDS',
              referenceId: auction.id,
            });
          } catch (error) {
            this.logger.error(`Failed to send end auction no-bid notification: ${error.message}`);
          }
        }
      }

      // Notify all users who favorited this auction
      try {
        const favoritedUsers = await this.prisma.favorite.findMany({
          where: {
            auctionId: auction.id,
            userId: {
              notIn: [
                auction.product.ownerId,
                ...(auction.currentWinnerId ? [auction.currentWinnerId] : []),
              ],
            },
          },
          select: { userId: true },
        });

        for (const fav of favoritedUsers) {
          await this.notificationsService.createNotification(fav.userId, {
            title: 'Sản phẩm yêu thích đã kết thúc',
            content: `Phiên đấu giá sản phẩm "${auction.product.title}" mà bạn thả tim vừa kết thúc với giá thắng cuộc: ${auction.currentPrice.toLocaleString('vi-VN')} đ.`,
            type: 'FAVORITE_ENDED',
            referenceId: auction.id,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to send favorited end notifications: ${error.message}`);
      }
    }
  }

  // =========================================================================
  // CRON JOB 1: TỰ ĐỘNG XỬ LÝ ĐƠN HÀNG QUÁ HẠN THANH TOÁN (PAYMENT TIMEOUT - 48H)
  // Bùng kèo: Hủy đơn, Tịch thu tiền cọc WalletHold, Trừ 20 điểm Uy tín, Cảnh cáo / BAN
  // =========================================================================
  @Cron('*/5 * * * *') // Run every 5 minutes
  async handleUnpaidOrderTimeouts() {
    const timeoutThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    const unpaidOrders = await this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lte: timeoutThreshold },
      },
      include: {
        buyer: true,
        seller: true,
        auction: { include: { product: true } },
        walletHolds: true,
      },
    });

    if (unpaidOrders.length === 0) return;

    this.logger.log(`Found ${unpaidOrders.length} unpaid orders exceeding 48h deadline. Processing penalties...`);

    for (const order of unpaidOrders) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // 1. Cập nhật trạng thái Đơn hàng thành CANCELLED
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
            },
          });

          // 2. Cập nhật cảnh báo vi phạm cho người mua
          await tx.user.update({
            where: { id: order.buyerId },
            data: {
              rating: Math.max(0, (order.buyer.rating || 5) - 0.5),
            },
          });

          // 3. Kiểm tra số lần bùng kèo (CANCELLED unpaid orders). Nếu >= 3 lần -> Tự động BAN tài khoản
          const unpaidCount = await tx.order.count({
            where: {
              buyerId: order.buyerId,
              status: 'CANCELLED',
              paidAt: null,
            },
          });

          if (unpaidCount >= 3) {
            await tx.user.update({
              where: { id: order.buyerId },
              data: { status: 'BANNED' },
            });
            this.logger.warn(`User ${order.buyer.email} automatically BANNED for 3+ unpaid order strikes.`);
          }

          // 4. Tịch thu / Giải phóng WalletHold ký quỹ (nếu có)
          if (order.walletHolds && order.walletHolds.length > 0) {
            for (const hold of order.walletHolds) {
              await tx.walletHold.update({
                where: { id: hold.id },
                data: {
                  releasedAt: new Date(),
                  releasedBy: 'SYSTEM_UNPAID_PENALTY',
                  reason: 'Tịch thu cọc do quá hạn 48h không thanh toán đơn hàng',
                },
              });
            }
          }
        });

        // 5. Lấy điểm Uy Tín Người Mua đã được cập nhật trừ điểm và Gửi thông báo đẩy
        const updatedBuyer = await this.usersService.findById(order.buyerId);
        const currentScore = updatedBuyer.buyerTrustScore ?? 100;

        await this.notificationsService.createNotification(order.buyerId, {
          title: '⚠️ Đơn hàng bị hủy & Trừ 20 Điểm Uy Tín Người Mua!',
          content: `Đơn hàng #${order.id.slice(0, 8)} cho sản phẩm "${order.auction.product.title}" đã bị hủy tự động do quá hạn 48 giờ không thanh toán. Bạn bị trừ 20 điểm Uy Tín Người Mua (Điểm uy tín hiện tại: ${currentScore}/100).`,
          type: 'ORDER_CANCELLED_UNPAID',
          referenceId: order.id,
        });

        await this.notificationsService.createNotification(order.sellerId, {
          title: 'Đơn hàng đã tự động hủy',
          content: `Đơn hàng cho sản phẩm "${order.auction.product.title}" đã được hệ thống hủy tự động do người mua không hoàn tất thanh toán sau 48 giờ.`,
          type: 'ORDER_CANCELLED_UNPAID',
          referenceId: order.id,
        });

      } catch (err: any) {
        this.logger.error(`Failed to process unpaid timeout for order ${order.id}: ${err.message}`);
      }
    }
  }

  // =========================================================================
  // CRON JOB 2: TỰ ĐỘNG XÁC NHẬN ĐÃ GIAO HÀNG & GIẢI NGÂN (AUTO-COMPLETE - 3 NGÀY)
  // Sau 3 ngày từ khi SHIPPED nếu không có Khiếu nại Refund -> Auto COMPLETED
  // =========================================================================
  @Cron('*/5 * * * *') // Run every 5 minutes
  async handleAutoCompletedOrders() {
    const autoFinishThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days after delivery

    // Tự động chuyển COMPLETED cho đơn hàng DELIVERED quá 3 ngày (hoặc SHIPPED quá 7 ngày nếu không khiếu nại)
    const shippedOrders = await this.prisma.order.findMany({
      where: {
        OR: [
          {
            status: 'DELIVERED',
            deliveredAt: { lte: autoFinishThreshold }
          },
          {
            status: 'SHIPPED',
            shippedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Max 7 days shipping fallback
          }
        ],
        refundRequests: {
          none: {
            status: { in: ['PENDING', 'APPROVED'] }
          }
        }
      },
      include: {
        auction: { include: { product: true } },
      },
    });

    if (shippedOrders.length === 0) return;

    this.logger.log(`Found ${shippedOrders.length} shipped orders exceeding 3-day delivery window. Auto-completing...`);

    for (const order of shippedOrders) {
      try {
        await this.ordersService.updateOrderStatus(order.buyerId, order.id, 'COMPLETED' as any);

        await this.notificationsService.createNotification(order.buyerId, {
          title: 'Đơn hàng đã tự động hoàn tất',
          content: `Đơn hàng sản phẩm "${order.auction.product.title}" đã được tự động xác nhận hoàn tất sau 3 ngày vận chuyển.`,
          type: 'ORDER_AUTO_COMPLETED',
          referenceId: order.id,
        });

        const feePercent = getPlatformFeePercent();
        await this.notificationsService.createNotification(order.sellerId, {
          title: '💰 Tiền hàng đã được giải ngân!',
          content: `Đơn hàng "${order.auction.product.title}" đã tự động hoàn tất sau 3 ngày giao hàng. Tiền hàng (trừ ${feePercent}% phí sàn) đã được cộng vào Ví của bạn.`,
          type: 'ORDER_AUTO_COMPLETED',
          referenceId: order.id,
        });

      } catch (err: any) {
        this.logger.error(`Failed to auto-complete order ${order.id}: ${err.message}`);
      }
    }
  }
}
