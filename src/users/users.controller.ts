import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile/my-profile')
  async getMyProfile(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile/my-analytics')
  async getMyAnalytics(@Request() req, @Query('period') period: 'day' | 'month' | 'year' = 'month') {
    return this.usersService.getUserAnalytics(req.user.userId, period);
  }

  @Get('profile/:id')
  async getProfile(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile/my-profile')
  async updateProfile(
    @Request() req,
    @Body('name') name?: string,
    @Body('avatar') avatar?: string,
  ) {
    return this.usersService.updateProfile(req.user.userId, { name, avatar });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('seller-verification/submit')
  async submitSellerVerification(
    @Request() req,
    @Body('shopName') shopName: string,
    @Body('idNumber') idNumber: string,
    @Body('idImages') idImages: string[],
    @Body('warehouseAddress') warehouseAddress: string,
    @Body('bankAccount') bankAccount: string,
    @Body('phone') phone?: string,
  ) {
    return this.usersService.submitSellerVerification(req.user.userId, {
      shopName,
      idNumber,
      idImages,
      warehouseAddress,
      bankAccount,
      phone,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('report')
  async createReport(
    @Request() req,
    @Body('reason') reason: string,
    @Body('reportedUserId') reportedUserId?: string,
    @Body('auctionId') auctionId?: string,
  ) {
    return this.usersService.createReport(req.user.userId, {
      reason,
      reportedUserId,
      auctionId,
    });
  }
}
