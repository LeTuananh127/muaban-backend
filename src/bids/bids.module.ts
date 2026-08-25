import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { BidsGateway } from './bids.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, NotificationsModule, UsersModule],
  controllers: [BidsController],
  providers: [BidsService, BidsGateway],
})
export class BidsModule {}
