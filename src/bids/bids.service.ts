import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BidsGateway } from './bids.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bidsGateway: BidsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async placeBid(userId: string, auctionId: string, amount: number) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (auction.product.ownerId === userId) {
      throw new BadRequestException('You cannot bid on your own product');
    }

    if (auction.status !== 'ACTIVE') {
      throw new BadRequestException(`Auction is ${auction.status.toLowerCase()}`);
    }

    if (auction.minTrustScore && auction.minTrustScore > 0) {
      const buyerReviews = await this.prisma.review.findMany({
        where: { revieweeId: userId },
        include: { order: true },
      });
      const receivedBuyerReviews = buyerReviews.filter((r) => r.order && r.order.buyerId === userId);
      const buyerRating = receivedBuyerReviews.length > 0
        ? receivedBuyerReviews.reduce((sum, r) => sum + r.rating, 0) / receivedBuyerReviews.length
        : 5.0;
      const buyerTrustScore = Math.min(100, Math.round(buyerRating * 20));

      if (buyerTrustScore < auction.minTrustScore) {
        throw new BadRequestException(
          `Rất tiếc! Phiên đấu giá này yêu cầu Người mua có Điểm uy tín tối thiểu từ ${auction.minTrustScore}/100 điểm trở lên (Điểm uy tín người mua của bạn: ${buyerTrustScore}/100 điểm).`
        );
      }
    }

    const now = new Date();
    if (now > auction.endTime) {
      // Trigger status update if needed
      await this.prisma.auction.update({
        where: { id: auctionId },
        data: { status: 'ENDED' },
      });
      throw new BadRequestException('Auction has ended');
    }

    const timeRemaining = auction.endTime.getTime() - now.getTime();
    const shouldExtend = timeRemaining > 0 && timeRemaining < 120000;
    const newEndTime = shouldExtend ? new Date(now.getTime() + 120000) : auction.endTime;

    if (amount < auction.currentPrice + auction.bidIncrement) {
      throw new BadRequestException(`Bid must be at least ${auction.currentPrice + auction.bidIncrement}`);
    }

    // Check wallet balance
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId, balance: 0 } });
    }
    const holds = await this.prisma.walletHold.findMany({
      where: { walletId: wallet.id, releasedAt: null },
    });
    const held = holds.reduce((sum, hold) => sum + hold.amount, 0);
    const available = wallet.balance - held;

    if (available < amount) {
      throw new BadRequestException(`Số dư ví không đủ. Bạn cần có tối thiểu ${amount.toLocaleString('vi-VN')} đ để đặt mức giá này.`);
    }

    // Process the bid securely in a transaction
    const newBidResult = await this.prisma.$transaction(async (tx) => {
      // Create bid
      const newBid = await tx.bid.create({
        data: {
          auctionId,
          userId,
          amount,
        },
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
        },
      });

      // Update auction
      const updatedAuction = await tx.auction.update({
        where: { id: auctionId },
        data: {
          currentPrice: amount,
          currentWinnerId: userId,
          ...(shouldExtend ? { endTime: newEndTime } : {}),
        },
      });

      // If buy now price is met, end the auction immediately and create the order
      if (updatedAuction.buyNowPrice && amount >= updatedAuction.buyNowPrice) {
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: 'ENDED' },
        });
        
        await tx.product.update({
          where: { id: updatedAuction.productId },
          data: { status: 'SOLD' },
        });

        // Create the order immediately
        await tx.order.create({
          data: {
            auctionId,
            buyerId: userId,
            sellerId: auction.product.ownerId,
            totalAmount: amount + (auction.shippingCost || 0),
            status: 'PENDING',
          },
        });
      }

      return { newBid, currentPrice: amount, status: updatedAuction.status, endTime: updatedAuction.endTime };
    });

    // Broadcast the real-time update
    this.bidsGateway.broadcastNewBid(auctionId, newBidResult);

    // Run auto-bids check in the background
    (async () => {
      try {
        await this.runProxyBidding(auctionId);
      } catch (err) {
        console.error('Error running proxy bidding:', err);
      }
    })();

    // Send notifications in the background
    (async () => {
      try {
        if (newBidResult.status === 'ENDED') {
          // Won by buy now
          // Notify buyer
          await this.notificationsService.createNotification(userId, {
            title: 'Chúc mừng bạn đã thắng đấu giá!',
            content: `Chúc mừng! Bạn đã thắng đấu giá sản phẩm "${auction.product.title}" với giá mua ngay: ${amount.toLocaleString('vi-VN')} đ. Hãy hoàn tất thanh toán.`,
            type: 'AUCTION_ENDED_WINNER',
            referenceId: auctionId,
          });

          // Notify seller
          await this.notificationsService.createNotification(auction.product.ownerId, {
            title: 'Sản phẩm đã bán thành công!',
            content: `Sản phẩm "${auction.product.title}" của bạn đã bán thành công qua hình thức Mua Ngay với giá: ${amount.toLocaleString('vi-VN')} đ.`,
            type: 'AUCTION_ENDED_WINNER',
            referenceId: auctionId,
          });
        } else {
          // Standard new bid
          // Notify seller
          await this.notificationsService.createNotification(auction.product.ownerId, {
            title: 'Lượt ra giá mới',
            content: `Sản phẩm "${auction.product.title}" của bạn vừa có lượt đặt giá mới: ${amount.toLocaleString('vi-VN')} đ`,
            type: 'NEW_BID',
            referenceId: auctionId,
          });

          // Notify the outbid user
          if (auction.currentWinnerId && auction.currentWinnerId !== userId) {
            await this.notificationsService.createNotification(auction.currentWinnerId, {
              title: 'Bạn đã bị outbid!',
              content: `Bạn đã bị outbid ở sản phẩm "${auction.product.title}". Giá cao nhất hiện tại là ${amount.toLocaleString('vi-VN')} đ`,
              type: 'OUTBID',
              referenceId: auctionId,
            });

            const outbidUser = await this.prisma.user.findUnique({
              where: { id: auction.currentWinnerId },
              select: { email: true, name: true },
            });
            if (outbidUser) {
              this.mailService.sendOutbidNotification(
                outbidUser.email,
                outbidUser.name,
                auction.product.title,
                amount,
                auctionId,
              ).catch((e) => console.error('Outbid email error:', e));
            }
          }
        }
      } catch (err) {
        console.error('Error creating notifications in placeBid:', err);
      }
    })();

    return newBidResult;
  }

  async getBidsByAuction(auctionId: string) {
    return this.prisma.bid.findMany({
      where: { auctionId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { amount: 'desc' },
    });
  }

  async setAutoBid(userId: string, auctionId: string, maxAmount: number) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });

    if (!auction) {
      throw new NotFoundException('Auction not found');
    }

    if (auction.product.ownerId === userId) {
      throw new BadRequestException('You cannot set auto-bid on your own product');
    }

    if (auction.status !== 'ACTIVE') {
      throw new BadRequestException('Auction is not active');
    }

    const now = new Date();
    if (now > auction.endTime) {
      throw new BadRequestException('Auction has ended');
    }

    if (maxAmount < auction.currentPrice + auction.bidIncrement) {
      throw new BadRequestException(`Max amount must be at least ${auction.currentPrice + auction.bidIncrement}`);
    }

    // Check wallet balance
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId, balance: 0 } });
    }
    const holds = await this.prisma.walletHold.findMany({
      where: { walletId: wallet.id, releasedAt: null },
    });
    const held = holds.reduce((sum, hold) => sum + hold.amount, 0);
    const available = wallet.balance - held;

    if (available < maxAmount) {
      throw new BadRequestException(`Số dư ví không đủ. Bạn cần có tối thiểu ${maxAmount.toLocaleString('vi-VN')} đ trong ví.`);
    }

    const autoBid = await this.prisma.autoBid.upsert({
      where: {
        userId_auctionId: {
          userId,
          auctionId,
        },
      },
      update: {
        maxAmount,
      },
      create: {
        userId,
        auctionId,
        maxAmount,
      },
    });

    // Run proxy bidding in the background
    (async () => {
      try {
        await this.runProxyBidding(auctionId);
      } catch (err) {
        console.error('Error running proxy bidding after setting auto-bid:', err);
      }
    })();

    return { message: 'Đã thiết lập Auto-bid thành công', autoBid };
  }

  async runProxyBidding(auctionId: string) {
    let nextBidAmount = 0;
    let winnerId = '';

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { product: true },
    });
    if (!auction || auction.status !== 'ACTIVE') return;

    // Get all auto-bids sorted by maxAmount desc
    const autoBids = await this.prisma.autoBid.findMany({
      where: { auctionId },
      orderBy: { maxAmount: 'desc' },
    });
    if (autoBids.length === 0) return;

    const highestAutoBid = autoBids[0];
    const secondHighestAutoBid = autoBids[1];

    const currentWinnerId = auction.currentWinnerId;
    const currentPrice = auction.currentPrice;
    const increment = auction.bidIncrement;

    if (highestAutoBid.userId !== currentWinnerId) {
      nextBidAmount = currentPrice + increment;

      if (secondHighestAutoBid) {
        nextBidAmount = Math.max(nextBidAmount, secondHighestAutoBid.maxAmount + increment);
      }

      nextBidAmount = Math.min(nextBidAmount, highestAutoBid.maxAmount);
      winnerId = highestAutoBid.userId;

      if (nextBidAmount >= currentPrice + increment) {
        const newBidResult = await this.prisma.$transaction(async (tx) => {
          // Check wallet balance
          let wallet = await tx.wallet.findUnique({ where: { userId: winnerId } });
          if (!wallet) {
            wallet = await tx.wallet.create({ data: { userId: winnerId, balance: 0 } });
          }
          const holds = await tx.walletHold.findMany({
            where: { walletId: wallet.id, releasedAt: null },
          });
          const held = holds.reduce((sum, hold) => sum + hold.amount, 0);
          const available = wallet.balance - held;

          if (available < nextBidAmount) {
            return null; // Skip if they ran out of money
          }

          // Create bid
          const newBid = await tx.bid.create({
            data: {
              auctionId,
              userId: winnerId,
              amount: nextBidAmount,
            },
            include: {
              user: { select: { id: true, name: true, avatar: true } },
            },
          });

          // Check if it triggers sniper extension
          const now = new Date();
          const timeRemaining = auction.endTime.getTime() - now.getTime();
          const shouldExtend = timeRemaining > 0 && timeRemaining < 120000;
          const newEndTime = shouldExtend ? new Date(now.getTime() + 120000) : auction.endTime;

          // Update auction
          const updatedAuction = await tx.auction.update({
            where: { id: auctionId },
            data: {
              currentPrice: nextBidAmount,
              currentWinnerId: winnerId,
              ...(shouldExtend ? { endTime: newEndTime } : {}),
            },
          });

          return { newBid, currentPrice: nextBidAmount, status: updatedAuction.status, endTime: updatedAuction.endTime };
        });

        if (newBidResult) {
          // Broadcast to clients
          this.bidsGateway.broadcastNewBid(auctionId, newBidResult);

          // Notify outbid user
          if (currentWinnerId && currentWinnerId !== winnerId) {
            try {
              await this.notificationsService.createNotification(currentWinnerId, {
                title: 'Bạn đã bị outbid!',
                content: `Hệ thống tự động đấu giá đã outbid bạn ở sản phẩm "${auction.product.title}". Giá cao nhất hiện tại là ${nextBidAmount.toLocaleString('vi-VN')} đ`,
                type: 'OUTBID',
                referenceId: auctionId,
              });
            } catch (err) {
              console.error('Error creating outbid notification in auto-bid:', err);
            }
          }

          // Recurse to see if we need to run it again
          await this.runProxyBidding(auctionId);
        }
      }
    }
  }
}

