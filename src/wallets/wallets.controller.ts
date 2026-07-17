import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallet')
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  @Get()
  getMyWallet(@Request() req) {
    return this.walletsService.getMyWallet(req.user.userId);
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

  @Post('withdraw')
  requestWithdraw(
    @Request() req,
    @Body('amount') amount: number,
    @Body('bankName') bankName: string,
    @Body('accountNo') accountNo: string,
    @Body('accountName') accountName: string,
  ) {
    return this.walletsService.requestWithdraw(
      req.user.userId,
      amount,
      bankName,
      accountNo,
      accountName,
    );
  }
}
