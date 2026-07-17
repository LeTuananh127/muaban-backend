import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async createPayment(
    orderId: string,
    method: PaymentMethod,
    description?: string,
  ) {
    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException('Order is not in pending status');
    }

    const paymentAmount = order.totalAmount;

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        amount: paymentAmount,
        method,
        status: PaymentStatus.PENDING,
        description,
      },
    });

    // Link the payment to the order
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: payment.id },
    });

    return payment;
  }

  async getPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async completePayment(paymentId: string, transactionId: string) {
    const payment = await this.getPayment(paymentId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not in pending status');
    }

    // Update payment status
    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.COMPLETED,
        transactionId,
        completedAt: new Date(),
      },
    });

    // Update order status to PAID only if it is currently PENDING
    const order = await this.prisma.order.findUnique({
      where: { id: payment.orderId },
    });
    if (order && order.status === OrderStatus.PENDING) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        // cast to any because Prisma Client types may be out-of-sync in some dev states
        data: ({ status: OrderStatus.PAID, paidAt: new Date() } as any),
      });
    }

    return updatedPayment;
  }

  async failPayment(paymentId: string, reason: string) {
    const payment = await this.getPayment(paymentId);

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: reason,
        failedAt: new Date(),
      },
    });

    return updatedPayment;
  }

  async refundPayment(paymentId: string) {
    const payment = await this.getPayment(paymentId);

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed payments');
    }

    const refundedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });

    return refundedPayment;
  }

  async getOrderPayment(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found for this order');
    }

    return payment;
  }
}
