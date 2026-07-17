import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { EscrowService } from '../escrow/escrow.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [WalletsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, EscrowService, PrismaService],
  exports: [PaymentsService, EscrowService],
})
export class PaymentsModule {}
