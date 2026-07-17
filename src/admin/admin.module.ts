import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [PrismaModule, OrdersModule, WalletsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
