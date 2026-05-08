import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';

@Module({
  imports: [PrismaModule, OrdersModule],
  providers: [TasksService, OrdersService]
})
export class TasksModule {}
