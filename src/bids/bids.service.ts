import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BidsGateway } from './bids.gateway';

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bidsGateway: BidsGateway,
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

    if (new Date() > auction.endTime) {
      // Trigger status update if needed
      await this.prisma.auction.update({
        where: { id: auctionId },
        data: { status: 'ENDED' },
      });
      throw new BadRequestException('Auction has ended');
    }

    if (amount < auction.currentPrice + auction.bidIncrement) {
      throw new BadRequestException(`Bid must be at least ${auction.currentPrice + auction.bidIncrement}`);
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
        },
      });

      // If buy now price is met, end the auction immediately
      if (updatedAuction.buyNowPrice && amount >= updatedAuction.buyNowPrice) {
        await tx.auction.update({
          where: { id: auctionId },
          data: { status: 'ENDED' },
        });
        
        await tx.product.update({
          where: { id: updatedAuction.productId },
          data: { status: 'SOLD' },
        });
      }

      return { newBid, currentPrice: amount, status: updatedAuction.status };
    });

    // Broadcast the real-time update
    this.bidsGateway.broadcastNewBid(auctionId, newBidResult);

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
}

