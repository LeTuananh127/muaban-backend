import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { BidsGateway } from './bids.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BidsController],
  providers: [BidsService, BidsGateway],
})
export class BidsModule {}
