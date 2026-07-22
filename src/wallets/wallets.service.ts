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

  async createVnpayPaymentUrl(userId: string, amount: number, ipAddr?: string) {
    if (amount < 10000) {
      throw new BadRequestException('Số tiền nạp tối thiểu qua VNPAY là 10.000 đ');
    }
    const txnRef = `vnp_${userId.substring(0, 6)}_${Date.now()}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://muabandocuui.vercel.app';
    const returnUrl = `${frontendUrl}/wallet?vnpay=return`;
    const orderInfo = `Nap tien vi AuctionHub ${amount.toLocaleString('vi-VN')}d`;

    const paymentUrl = buildVnpayUrl({
      amount,
      orderInfo,
      txnRef,
      ipAddr,
      returnUrl,
    });

    return { paymentUrl, txnRef };
  }

  async verifyVnpayCallback(userId: string, vnpParams: Record<string, any>) {
    const isValid = verifyVnpaySignature({ ...vnpParams });
    if (!isValid) {
      throw new BadRequestException('Chữ ký VNPAY không hợp lệ');
    }

    const responseCode = vnpParams['vnp_ResponseCode'];
    if (responseCode !== '00') {
      throw new BadRequestException(`Giao dịch VNPAY không thành công (Mã lỗi: ${responseCode})`);
    }

    const rawAmount = parseInt(vnpParams['vnp_Amount'] || '0', 10);
    const amount = rawAmount / 100;
    const txnRef = vnpParams['vnp_TxnRef'] || `VNPAY_${Date.now()}`;

    const updatedWallet = await this.topUp(userId, amount, `VNPAY:${txnRef}`);
    return {
      success: true,
      amount,
      message: `Nạp thành công ${amount.toLocaleString('vi-VN')} đ qua VNPAY Sandbox!`,
      wallet: updatedWallet,
    };
  }
}

import * as crypto from 'crypto';

function formatVnpDate(date: Date): string {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
}

function sortObject(obj: any): any {
  const sorted: any = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
      sorted[key] = obj[key];
    }
  }
  return sorted;
}

export function buildVnpayUrl(params: {
  amount: number;
  orderInfo: string;
  txnRef: string;
  ipAddr?: string;
  returnUrl: string;
}): string {
  const vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const secretKey = process.env.VNPAY_HASH_SECRET || 'GETPNOEIZTRUXOXXWJUXMCLWJYZTVIHT';
  const tmnCode = process.env.VNPAY_TMN_CODE || '2QXUIBJZ';

  const date = new Date();
  const createDate = formatVnpDate(date);

  let vnpParams: Record<string, string | number> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: params.txnRef,
    vnp_OrderInfo: params.orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: params.amount * 100,
    vnp_ReturnUrl: params.returnUrl,
    vnp_IpAddr: params.ipAddr || '127.0.0.1',
    vnp_CreateDate: createDate,
  };

  vnpParams = sortObject(vnpParams);

  const signData = Object.keys(vnpParams)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(vnpParams[key])).replace(/%20/g, '+')}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', secretKey);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  vnpParams['vnp_SecureHash'] = signed;

  const queryString = Object.keys(vnpParams)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(vnpParams[key])).replace(/%20/g, '+')}`)
    .join('&');

  return `${vnpUrl}?${queryString}`;
}

export function verifyVnpaySignature(vnpParams: Record<string, any>): boolean {
  const secretKey = process.env.VNPAY_HASH_SECRET || 'GETPNOEIZTRUXOXXWJUXMCLWJYZTVIHT';
  const secureHash = vnpParams['vnp_SecureHash'];

  delete vnpParams['vnp_SecureHash'];
  delete vnpParams['vnp_SecureHashType'];

  const sortedParams = sortObject(vnpParams);
  const signData = Object.keys(sortedParams)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(sortedParams[key])).replace(/%20/g, '+')}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', secretKey);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return secureHash === signed;
}
