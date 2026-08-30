import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  @Get()
  getMyWallet(@Request() req) {
    return this.walletsService.getMyWallet(req.user.userId);
  }

  @Get('escrows')
  getMyEscrows(@Request() req) {
    return this.walletsService.getMyEscrowsAndHolds(req.user.userId);
  }

  @Get('transactions')
  getMyTransactions(@Request() req) {
    return this.walletsService.getMyTransactions(req.user.userId);
  }

  @Post('topup')
  topUp(@Request() req, @Body('amount') amount: number, @Body('reference') reference?: string) {
    return this.walletsService.topUp(req.user.userId, amount, reference);
  }

  @Post('hold')
  createHold(
    @Request() req,
    @Body('amount') amount: number,
    @Body('reason') reason?: string,
    @Body('orderId') orderId?: string,
  ) {
    return this.walletsService.createHold(req.user.userId, amount, reason, orderId);
  }

  @Post('hold/:id/release')
  releaseHold(@Request() req, @Param('id') holdId: string) {
    return this.walletsService.releaseHold(req.user.userId, holdId);
  }

  @Post('hold/:id/capture')
  captureHold(@Request() req, @Param('id') holdId: string, @Body('reference') reference?: string) {
    return this.walletsService.captureHold(req.user.userId, holdId, reference);
  }

  @Post('deduct')
  deduct(@Request() req, @Body('amount') amount: number, @Body('reference') reference?: string) {
    return this.walletsService.deduct(req.user.userId, amount, reference);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('withdraw/send-otp')
  sendWithdrawOtp(
    @Request() req,
    @Body('amount') amount: number,
    @Body('bankName') bankName: string,
    @Body('accountNo') accountNo: string,
  ) {
    return this.walletsService.sendWithdrawOtp(
      req.user.userId,
      amount,
      bankName,
      accountNo,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('withdraw')
  requestWithdraw(
    @Request() req,
    @Body('amount') amount: number,
    @Body('bankName') bankName: string,
    @Body('accountNo') accountNo: string,
    @Body('accountName') accountName: string,
    @Body('otp') otp?: string,
  ) {
    return this.walletsService.requestWithdraw(
      req.user.userId,
      amount,
      bankName,
      accountNo,
      accountName,
      otp,
    );
  }

  @Post('vnpay/create-url')
  createVnpayUrl(
    @Request() req,
    @Body('amount') amount: number,
    @Body('returnUrl') customReturnUrl?: string,
  ) {
    const ipAddr = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '');
    const fallbackReturnUrl = origin ? `${origin}/wallet?vnpay=return` : undefined;
    return this.walletsService.createVnpayPaymentUrl(
      req.user.userId,
      amount,
      ipAddr,
      customReturnUrl || fallbackReturnUrl,
    );
  }

  @Post('vnpay/verify-return')
  verifyVnpayReturn(@Request() req, @Body() vnpParams: Record<string, any>) {
    return this.walletsService.verifyVnpayCallback(req.user.userId, vnpParams);
  }

  @Post('momo/create-url')
  createMomoUrl(
    @Request() req,
    @Body('amount') amount: number,
    @Body('returnUrl') customReturnUrl?: string,
  ) {
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '');
    const fallbackReturnUrl = origin ? `${origin}/wallet?momo=return` : undefined;
    return this.walletsService.createMomoPaymentUrl(
      req.user.userId,
      amount,
      customReturnUrl || fallbackReturnUrl,
    );
  }

  @Post('momo/verify-return')
  verifyMomoReturn(@Request() req, @Body() momoParams: Record<string, any>) {
    return this.walletsService.verifyMomoCallback(req.user.userId, momoParams);
  }
}

