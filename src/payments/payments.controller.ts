import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { EscrowService } from '../escrow/escrow.service';
import { WalletsService } from '../wallets/wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentMethod, Escrow } from '@prisma/client';

@Controller('payments')
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private escrowService: EscrowService,
    private walletsService: WalletsService,
  ) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiatePayment(
    @Body()
    dto: {
      orderId: string;
      method: PaymentMethod;
      description?: string;
    },
  ) {
    const payment = await this.paymentsService.createPayment(
      dto.orderId,
      dto.method,
      dto.description,
    );

    let escrow: Escrow | null = null;
    if (dto.method !== PaymentMethod.CASH_ON_DELIVERY) {
      // Hold escrow funds
      escrow = await this.escrowService.holdEscrow(
        dto.orderId,
        payment.amount,
        `Escrow for order ${dto.orderId}`,
      );
    }

    return {
      payment,
      escrow,
      message: dto.method === PaymentMethod.CASH_ON_DELIVERY
        ? 'Payment initiated (COD)'
        : 'Payment initiated and funds held in escrow',
    };
  }

  @Post(':paymentId/complete')
  @UseGuards(JwtAuthGuard)
  async completePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: { transactionId: string },
  ) {
    if (!dto.transactionId) {
      throw new BadRequestException('Transaction ID is required');
    }

    const payment = await this.paymentsService.completePayment(
      paymentId,
      dto.transactionId,
    );

    return {
      payment,
      message: 'Payment completed successfully',
    };
  }

  @Post(':paymentId/pay-with-wallet')
  @UseGuards(JwtAuthGuard)
  async payWithWallet(@Request() req, @Param('paymentId') paymentId: string) {
    // fetch payment
    const payment = await this.paymentsService.getPayment(paymentId);
    if (!payment) throw new BadRequestException('Payment not found');

    // attempt to deduct from wallet
    await this.walletsService.deduct(req.user.userId, payment.amount, `payment:${paymentId}`);

    // mark payment complete with synthetic transaction id
    const transactionId = `WALLET:${Date.now()}`;
    const completed = await this.paymentsService.completePayment(paymentId, transactionId);

    return { payment: completed, message: 'Payment completed using wallet' };
  }

  @Post(':paymentId/fail')
  @UseGuards(JwtAuthGuard)
  async failPayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: { reason: string },
  ) {
    const payment = await this.paymentsService.failPayment(
      paymentId,
      dto.reason || 'Payment failed',
    );

    return {
      payment,
      message: 'Payment marked as failed',
    };
  }

  @Post(':paymentId/refund')
  @UseGuards(JwtAuthGuard)
  async refundPayment(@Param('paymentId') paymentId: string) {
    const payment = await this.paymentsService.refundPayment(paymentId);

    return {
      payment,
      message: 'Payment refunded successfully',
    };
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  async getOrderPayment(@Param('orderId') orderId: string) {
    return this.paymentsService.getOrderPayment(orderId);
  }

  @Get(':paymentId')
  @UseGuards(JwtAuthGuard)
  async getPayment(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPayment(paymentId);
  }
}
