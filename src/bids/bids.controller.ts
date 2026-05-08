import { Controller, Post, Body, Param, UseGuards, Request, Get } from '@nestjs/common';
import { BidsService } from './bids.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('bids')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Get(':auctionId')
  getBids(@Param('auctionId') auctionId: string) {
    return this.bidsService.getBidsByAuction(auctionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':auctionId')
  placeBid(
    @Request() req,
    @Param('auctionId') auctionId: string,
    @Body('amount') amount: number,
  ) {
    return this.bidsService.placeBid(req.user.userId, auctionId, amount);
  }
}
