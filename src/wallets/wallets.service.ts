import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

  async getOrCreateWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId, balance: 0 } });
    }
    return wallet;
  }

  async getMyWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const holds = await this.prisma.walletHold.findMany({ where: { walletId: wallet.id, releasedAt: null } });
    const held = holds.reduce((s, h) => s + h.amount, 0);
    return { ...wallet, heldAmount: held, available: wallet.balance - held };
  }

  async topUp(userId: string, amount: number, reference?: string) {
    if (amount <= 0) throw new BadRequestException('Invalid top-up amount');
    const wallet = await this.getOrCreateWallet(userId);
    const updated = await this.prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await this.prisma.walletTransaction.create({ data: { walletId: wallet.id, type: 'CREDIT', amount, reference } });
    return updated;
  }

  async createHold(userId: string, amount: number, reason?: string, orderId?: string) {
    if (amount <= 0) throw new BadRequestException('Invalid hold amount');
    const wallet = await this.getOrCreateWallet(userId);
    const holds = await this.prisma.walletHold.findMany({ where: { walletId: wallet.id, releasedAt: null } });
    const held = holds.reduce((s, h) => s + h.amount, 0);
    const available = wallet.balance - held;
    if (available < amount) throw new BadRequestException('Insufficient wallet balance');

    const hold = await this.prisma.walletHold.create({ data: { walletId: wallet.id, amount, reason, orderId } });
    return hold;
  }

  async releaseHold(userId: string, holdId: string, releasedBy?: string) {
    const hold = await this.prisma.walletHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new NotFoundException('Hold not found');
    const wallet = await this.getOrCreateWallet(userId);
    if (hold.walletId !== wallet.id) throw new BadRequestException('Hold does not belong to user');
    if (hold.releasedAt) throw new BadRequestException('Hold already released');

    const released = await this.prisma.walletHold.update({ where: { id: holdId }, data: { releasedAt: new Date(), releasedBy } });
    return released;
  }

  async captureHold(userId: string, holdId: string, reference?: string) {
    const hold = await this.prisma.walletHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new NotFoundException('Hold not found');
    const wallet = await this.getOrCreateWallet(userId);
    if (hold.walletId !== wallet.id) throw new BadRequestException('Hold does not belong to user');
    if (hold.releasedAt) throw new BadRequestException('Hold already released');

    // Deduct balance and mark hold released
    const updatedWallet = await this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: hold.amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'DEBIT', amount: hold.amount, reference } });
      await tx.walletHold.update({ where: { id: holdId }, data: { releasedAt: new Date(), releasedBy: userId } });
      return w;
    });

    return updatedWallet;
  }

  async deduct(userId: string, amount: number, reference?: string) {
    if (amount <= 0) throw new BadRequestException('Invalid amount');
    const wallet = await this.getOrCreateWallet(userId);
    const holds = await this.prisma.walletHold.findMany({ where: { walletId: wallet.id, releasedAt: null } });
    const held = holds.reduce((s, h) => s + h.amount, 0);
    const available = wallet.balance - held;
    if (available < amount) throw new BadRequestException('Insufficient wallet balance');

    const updated = await this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'DEBIT', amount, reference } });
      return w;
    });

    return updated;
  }

  async requestWithdraw(userId: string, amount: number, bankName: string, accountNo: string, accountName: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    
    const wallet = await this.getOrCreateWallet(userId);
    const holds = await this.prisma.walletHold.findMany({ where: { walletId: wallet.id, releasedAt: null } });
    const held = holds.reduce((s, h) => s + h.amount, 0);
    const available = wallet.balance - held;
    if (available < amount) throw new BadRequestException('Insufficient wallet balance');

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amount,
          reference: `withdraw_pending`,
        },
      });
      return tx.withdrawRequest.create({
        data: {
          userId,
          amount,
          bankName,
          accountNo,
          accountName,
          status: 'PENDING',
        },
      });
    });
  }

  async getWithdrawRequests() {
    return this.prisma.withdrawRequest.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveWithdraw(requestId: string, note?: string) {
    const request = await this.prisma.withdrawRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Withdraw request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is not pending');

    return this.prisma.withdrawRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        processedAt: new Date(),
        note,
      },
    });
  }

  async rejectWithdraw(requestId: string, note?: string) {
    const request = await this.prisma.withdrawRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Withdraw request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is not pending');

    const wallet = await this.getOrCreateWallet(request.userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: request.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: request.amount,
          reference: `withdraw_rejected:${requestId}`,
        },
      });
      return tx.withdrawRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          processedAt: new Date(),
          note,
        },
      });
    });
  }
}
