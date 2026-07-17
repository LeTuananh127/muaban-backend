import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private notificationsService: NotificationsService,
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
    }
  }
}
