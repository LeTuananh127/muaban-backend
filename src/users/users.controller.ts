import { Controller, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
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
    @Body('warehouseAddress') warehouseAddress: string,
    @Body('bankAccount') bankAccount: string,
    @Body('phone') phone?: string,
  ) {
    return this.usersService.submitSellerVerification(req.user.userId, {
      shopName,
      idNumber,
      warehouseAddress,
      bankAccount,
      phone,
    });
  }
}
