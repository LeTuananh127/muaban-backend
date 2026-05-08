import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/auction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Post()
  create(@Body() createAuctionDto: CreateAuctionDto, @Request() req) {
    return this.auctionsService.create(createAuctionDto, req.user.userId);
  }

  @Get()
  findAllActive() {
    return this.auctionsService.findAllActive();
  }

  @Get('search')
  searchAuctions(@Query() query: any) {
    return this.auctionsService.searchAuctions(query);
  }

  @Get('search/suggestions')
  getSearchSuggestions(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.auctionsService.getSearchSuggestions(q, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }
}
