import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BidsGateway } from './bids.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bidsGateway: BidsGateway,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}

  async placeBid(userId: string, auctionId: string, amount: number) {
    const userProfile = await this.usersService.findById(userId);
    if (userProfile.status === 'BANNED') {
      throw new BadRequestException('Tài khoản của bạn hiện đang bị BANNED. Không thể tham gia đặt giá.');
    }

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
      const buyerTrustScore = userProfile.buyerTrustScore ?? 100;

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

    const triggerMinutes = (auction as any).extendTriggerMinutes ?? 2;
    const durationMinutes = (auction as any).extendDurationMinutes ?? 2;
    const triggerMs = triggerMinutes * 60 * 1000;
    const durationMs = durationMinutes * 60 * 1000;

    const timeRemaining = auction.endTime.getTime() - now.getTime();
    const shouldExtend = triggerMs > 0 && timeRemaining > 0 && timeRemaining < triggerMs;
    const newEndTime = shouldExtend ? new Date(now.getTime() + durationMs) : auction.endTime;

    // Price Ceiling Check: Mức đấu giá trần là mức Mua ngay (buyNowPrice)
    let finalAmount = amount;
    if (auction.buyNowPrice && auction.buyNowPrice > 0) {
      if (finalAmount > auction.buyNowPrice) {
        finalAmount = auction.buyNowPrice;
      }
    }

    const minRequiredBid = auction.buyNowPrice && auction.buyNowPrice > auction.currentPrice
      ? Math.min(auction.currentPrice + auction.bidIncrement, auction.buyNowPrice)
      : auction.currentPrice + auction.bidIncrement;

    if (finalAmount < minRequiredBid) {
      throw new BadRequestException(`Giá đặt phải tối thiểu là ${minRequiredBid.toLocaleString('vi-VN')} đ`);
    }

    // Deposit percent dynamically configured by Seller (Default: 0%)
    const pct = (auction as any).depositPercent ?? 0;
    const depositAmount = pct > 0 ? Math.round(finalAmount * (pct / 100)) : 0;

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

    if (depositAmount > 0 && available < depositAmount) {
      throw new BadRequestException(
        `Số dư khả dụng trong ví không đủ để ký quỹ cọc (Yêu cầu cọc ${pct}%: ${depositAmount.toLocaleString('vi-VN')} đ). Vui lòng nạp thêm tiền vào ví!`
      );
    }

    // Process the bid securely in a transaction
    const newBidResult = await this.prisma.$transaction(async (tx) => {
      // 1. Release previous active deposit holds for this auction
      const oldAuctionHolds = await tx.walletHold.findMany({
        where: {
          reason: { contains: `[auction_${auctionId}]` },
          releasedAt: null,
        },
      });
      for (const oldHold of oldAuctionHolds) {
        await tx.walletHold.update({
          where: { id: oldHold.id },
          data: {
            releasedAt: new Date(),
            releasedBy: 'OUTBID_SYSTEM',
            reason: `Hoàn cọc do có người đặt giá cao hơn (${finalAmount.toLocaleString('vi-VN')} đ)`,
          },
        });
      }

      // 2. Create new deposit hold for current highest bidder (if seller required deposit)
      let newHold: any = null;
      if (depositAmount > 0) {
        newHold = await tx.walletHold.create({
          data: {
            walletId: wallet.id,
            amount: depositAmount,
            reason: `Tạm giữ cọc ${pct}% đặt giá sản phẩm "${auction.product.title.slice(0, 30)}" [auction_${auctionId}]`,
          },
        });
      }

      // Create bid
      const newBid = await tx.bid.create({
        data: {
          auctionId,
          userId,
          amount: finalAmount,
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
          currentPrice: finalAmount,
          currentWinnerId: userId,
          ...(shouldExtend ? { endTime: newEndTime } : {}),
        },
      });

      // If buy now price ceiling is met, end the auction immediately and create the order
      if (updatedAuction.buyNowPrice && finalAmount >= updatedAuction.buyNowPrice) {
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: 'ENDED' },
        });
        
        await tx.product.update({
          where: { id: updatedAuction.productId },
          data: { status: 'SOLD' },
        });

        // Create the order immediately and link deposit hold
        const order = await tx.order.create({
          data: {
            auctionId,
            buyerId: userId,
            sellerId: auction.product.ownerId,
            totalAmount: finalAmount + (auction.shippingCost || 0),
            status: 'PENDING',
          },
        });

        if (newHold) {
          await tx.walletHold.update({
            where: { id: newHold.id },
            data: { orderId: order.id },
          });
        }
      }

      return { auctionId, newBid, currentPrice: finalAmount, status: (updatedAuction.buyNowPrice && finalAmount >= updatedAuction.buyNowPrice) ? 'ENDED' : updatedAuction.status, endTime: updatedAuction.endTime };
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
          // Notify users who favorited this auction
          const favoritedUsers = await this.prisma.favorite.findMany({
            where: {
              auctionId,
              userId: {
                notIn: [userId, auction.product.ownerId, ...(auction.currentWinnerId ? [auction.currentWinnerId] : [])],
              },
            },
            select: { userId: true },
          });

          for (const fav of favoritedUsers) {
            await this.notificationsService.createNotification(fav.userId, {
              title: 'Cập nhật từ sản phẩm yêu thích',
              content: `Sản phẩm "${auction.product.title}" mà bạn thả tim vừa có lượt đặt giá mới: ${amount.toLocaleString('vi-VN')} đ`,
              type: 'FAVORITE_BID',
              referenceId: auctionId,
            });

            if (shouldExtend) {
              await this.notificationsService.createNotification(fav.userId, {
                title: 'Sản phẩm yêu thích được gia hạn!',
                content: `Sản phẩm "${auction.product.title}" mà bạn thả tim vừa được tự động gia hạn thời gian kết thúc.`,
                type: 'FAVORITE_EXTENDED',
                referenceId: auctionId,
              });
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

    // Price Ceiling for Auto-bid: Không được vượt quá mức Mua ngay (buyNowPrice)
    let finalMaxAmount = maxAmount;
    if (auction.buyNowPrice && auction.buyNowPrice > 0 && finalMaxAmount > auction.buyNowPrice) {
      finalMaxAmount = auction.buyNowPrice;
    }

    const minRequiredAutoBid = auction.buyNowPrice && auction.buyNowPrice > auction.currentPrice
      ? Math.min(auction.currentPrice + auction.bidIncrement, auction.buyNowPrice)
      : auction.currentPrice + auction.bidIncrement;

    if (finalMaxAmount < minRequiredAutoBid) {
      throw new BadRequestException(`Giá tối đa Auto-bid phải ít nhất là ${minRequiredAutoBid.toLocaleString('vi-VN')} đ`);
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

    if (available < finalMaxAmount) {
      throw new BadRequestException(`Số dư ví không đủ. Bạn cần có tối thiểu ${finalMaxAmount.toLocaleString('vi-VN')} đ trong ví.`);
    }

    const autoBid = await this.prisma.autoBid.upsert({
      where: {
        userId_auctionId: {
          userId,
          auctionId,
        },
      },
      update: {
        maxAmount: finalMaxAmount,
      },
      create: {
        userId,
        auctionId,
        maxAmount: finalMaxAmount,
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

      // Price ceiling: Mức đấu giá trần là mức Mua ngay (buyNowPrice)
      if (auction.buyNowPrice && auction.buyNowPrice > 0 && nextBidAmount > auction.buyNowPrice) {
        nextBidAmount = auction.buyNowPrice;
      }

      winnerId = highestAutoBid.userId;

      const minRequiredProxyBid = auction.buyNowPrice && auction.buyNowPrice > currentPrice
        ? Math.min(currentPrice + increment, auction.buyNowPrice)
        : currentPrice + increment;

      if (nextBidAmount >= minRequiredProxyBid) {
        const newBidResult = await this.prisma.$transaction(async (tx) => {
          const depositAmount = Math.round(nextBidAmount * 0.10);
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

          if (available < depositAmount) {
            return null; // Skip if they ran out of deposit money
          }

          // Release previous active deposit holds for this auction
          const oldAuctionHolds = await tx.walletHold.findMany({
            where: {
              reason: { contains: `[auction_${auctionId}]` },
              releasedAt: null,
            },
          });
          for (const oldHold of oldAuctionHolds) {
            await tx.walletHold.update({
              where: { id: oldHold.id },
              data: {
                releasedAt: new Date(),
                releasedBy: 'OUTBID_SYSTEM',
                reason: `Hoàn cọc 10% do có người đặt giá cao hơn (${nextBidAmount.toLocaleString('vi-VN')} đ)`,
              },
            });
          }

          // Create new deposit hold for proxy bid winner
          const proxyHold = await tx.walletHold.create({
            data: {
              walletId: wallet.id,
              amount: depositAmount,
              reason: `Tạm giữ cọc 10% đặt giá sản phẩm "${auction.product.title.slice(0, 30)}" [auction_${auctionId}]`,
            },
          });

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

          // If buy now price ceiling is met, end the auction immediately
          if (updatedAuction.buyNowPrice && nextBidAmount >= updatedAuction.buyNowPrice) {
            await tx.auction.update({
              where: { id: auctionId },
              data: { status: 'ENDED' },
            });

            await tx.product.update({
              where: { id: updatedAuction.productId },
              data: { status: 'SOLD' },
            });

            const order = await tx.order.create({
              data: {
                auctionId,
                buyerId: winnerId,
                sellerId: auction.product.ownerId,
                totalAmount: nextBidAmount + (auction.shippingCost || 0),
                status: 'PENDING',
              },
            });

            if (proxyHold) {
              await tx.walletHold.update({
                where: { id: proxyHold.id },
                data: { orderId: order.id },
              });
            }
          }

          return { newBid, currentPrice: nextBidAmount, status: (updatedAuction.buyNowPrice && nextBidAmount >= updatedAuction.buyNowPrice) ? 'ENDED' : updatedAuction.status, endTime: updatedAuction.endTime };
        });

        if (newBidResult) {
          // Broadcast to clients
          this.bidsGateway.broadcastNewBid(auctionId, newBidResult);

          if (newBidResult.status === 'ENDED') {
            // Notify winner & seller
            try {
              await this.notificationsService.createNotification(winnerId, {
                title: 'Chúc mừng bạn đã thắng đấu giá!',
                content: `Chúc mừng! Bạn đã thắng đấu giá sản phẩm "${auction.product.title}" với giá trần: ${nextBidAmount.toLocaleString('vi-VN')} đ. Hãy hoàn tất thanh toán.`,
                type: 'AUCTION_ENDED_WINNER',
                referenceId: auctionId,
              });
              await this.notificationsService.createNotification(auction.product.ownerId, {
                title: 'Sản phẩm đã bán thành công!',
                content: `Sản phẩm "${auction.product.title}" của bạn đã bán thành công qua hình thức Đấu giá tự động đạt mức giá trần: ${nextBidAmount.toLocaleString('vi-VN')} đ.`,
                type: 'AUCTION_ENDED_WINNER',
                referenceId: auctionId,
              });
            } catch (err) {
              console.error('Error sending auto-bid end notifications:', err);
            }
          } else {
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
}

