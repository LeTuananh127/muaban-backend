import { Controller, Post, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrderStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':auctionId')
  createOrder(@Request() req, @Param('auctionId') auctionId: string) {
    return this.ordersService.createOrder(req.user.userId, auctionId);
  }

  @Get('buying')
  getMyBuyingOrders(@Request() req) {
    return this.ordersService.getMyBuyingOrders(req.user.userId);
  }

  @Get('selling')
  getMySellingOrders(@Request() req) {
    return this.ordersService.getMySellingOrders(req.user.userId);
  }

  @Get(':id')
  getOrderById(@Request() req, @Param('id') orderId: string) {
    return this.ordersService.getOrderById(req.user.userId, orderId);
  }

  @Patch(':id/status')
  updateOrderStatus(
    @Request() req,
    @Param('id') orderId: string,
    @Body('status') status: OrderStatus,
  ) {
    return this.ordersService.updateOrderStatus(req.user.userId, orderId, status);
  }

  @Post(':id/refund')
  requestRefund(
    @Request() req,
    @Param('id') orderId: string,
    @Body('reason') reason?: string,
    @Body('images') images?: string[],
  ) {
    return this.ordersService.requestRefund(req.user.userId, orderId, reason, images);
  }

  @Post('refund/:refundId/approve')
  approveRefund(@Request() req, @Param('refundId') refundId: string, @Body('note') note?: string) {
    return this.ordersService.approveRefund(req.user.userId, refundId, note);
  }

  @Post('refund/:refundId/reject')
  rejectRefund(@Request() req, @Param('refundId') refundId: string, @Body('note') note?: string) {
    return this.ordersService.rejectRefund(req.user.userId, refundId, note);
  }
}
