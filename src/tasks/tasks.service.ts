import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
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
    });

    if (endedAuctions.length === 0) return;

    for (const auction of endedAuctions) {
      this.logger.log(`Ending auction ${auction.id}...`);

      await this.prisma.$transaction(async (tx) => {
        // Đóng auction lại
        await tx.auction.update({
          where: { id: auction.id },
          data: { status: 'ENDED' },
        });

        // Cập nhật trạng thái Product
        await tx.product.update({ // if sold vs unsent
          where: { id: auction.productId },
          data: { status: auction.currentWinnerId ? 'SOLD' : 'AVAILABLE' },
        });
      });

      // Nếu có người thắng, tự động tạo Order tương ứng
      if (auction.currentWinnerId) {
        try {
          await this.ordersService.createOrder(auction.currentWinnerId, auction.id);
          this.logger.log(`Created auto-order for auction ${auction.id}`);
        } catch (error) {
          this.logger.error(`Failed to create order for ${auction.id}: ${error.message}`);
        }
      }
    }
  }
}
