import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowStatus } from '@prisma/client';

@Injectable()
export class EscrowService {
  constructor(private prisma: PrismaService) {}

  async holdEscrow(orderId: string, amount: number, description?: string) {
    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.escrowId) {
      throw new BadRequestException('Order already has an escrow');
    }

    // Create escrow record
    const escrow = await this.prisma.escrow.create({
      data: {
        orderId,
        amount,
        status: EscrowStatus.HELD,
        description,
      },
    });

    // Link escrow to order
    await this.prisma.order.update({
      where: { id: orderId },
      data: { escrowId: escrow.id },
    });

    return escrow;
  }

  async getEscrow(escrowId: string) {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }

    return escrow;
  }

  async releaseEscrow(escrowId: string) {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status !== EscrowStatus.HELD) {
      throw new BadRequestException('Escrow is not in held status');
    }

    // Fetch the order to get the sellerId
    const order = await this.prisma.order.findUnique({
      where: { id: escrow.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order associated with this escrow not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update escrow status
      const releasedEscrow = await tx.escrow.update({
        where: { id: escrowId },
        data: {
          status: EscrowStatus.RELEASED,
          releasedAt: new Date(),
        },
      });

      // Get or create seller's wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: order.sellerId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: order.sellerId,
            balance: 0,
          },
        });
      }

      const platformFee = Math.round(escrow.amount * 0.05); // 5% fee
      const sellerAmount = escrow.amount - platformFee;

      // Add money to seller's wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: sellerAmount },
        },
      });

      // Create credit transaction record
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: sellerAmount,
          reference: `order:${order.id}`,
        },
      });

      // Create platform fee transaction record
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'FEE',
          amount: platformFee,
          reference: `fee:order:${order.id}`,
        },
      });

      return releasedEscrow;
    });
  }

  async refundEscrow(escrowId: string) {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status !== EscrowStatus.HELD && escrow.status !== EscrowStatus.RELEASED) {
      throw new BadRequestException('Escrow is not in a refundable status');
    }

    // Fetch the order to get the buyerId
    const order = await this.prisma.order.findUnique({
      where: { id: escrow.orderId },
    });

    if (!order) {
      throw new NotFoundException('Order associated with this escrow not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const isAlreadyReleased = escrow.status === EscrowStatus.RELEASED;

      // Update escrow status
      const refundedEscrow = await tx.escrow.update({
        where: { id: escrowId },
        data: {
          status: EscrowStatus.REFUNDED,
          refundedAt: new Date(),
        },
      });

      // Get or create buyer's wallet
      let wallet = await tx.wallet.findUnique({
        where: { userId: order.buyerId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: order.buyerId,
            balance: 0,
          },
        });
      }

      // Add money back to buyer's wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: escrow.amount },
        },
      });

      // Create refund transaction record
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amount: escrow.amount,
          reference: `order:${order.id}`,
        },
      });

      // Deduct from seller's wallet if escrow was already released to them
      if (isAlreadyReleased) {
        let sellerWallet = await tx.wallet.findUnique({
          where: { userId: order.sellerId },
        });

        if (!sellerWallet) {
          sellerWallet = await tx.wallet.create({
            data: {
              userId: order.sellerId,
              balance: 0,
            },
          });
        }

        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: {
            balance: { decrement: escrow.amount },
          },
        });

        // Create debit transaction record
        await tx.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            type: 'DEBIT',
            amount: escrow.amount,
            reference: `refund_chargeback:${order.id}`,
          },
        });
      }

      return refundedEscrow;
    });
  }

  async getOrderEscrow(orderId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: { orderId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow not found for this order');
    }

    return escrow;
  }

  async autoReleaseEscrow(orderId: string) {
    // Called when order is marked as DELIVERED
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });

    if (!order || !order.escrow) {
      throw new NotFoundException('Order or escrow not found');
    }

    return this.releaseEscrow(order.escrow.id);
  }

  async autoRefundEscrow(orderId: string) {
    // Called when order is cancelled
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { escrow: true },
    });

    if (!order || !order.escrow) {
      throw new NotFoundException('Order or escrow not found');
    }

    return this.refundEscrow(order.escrow.id);
  }
}
