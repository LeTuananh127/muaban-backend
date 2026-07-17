import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAddressesService, CreateAddressDto, UpdateAddressDto } from './user-addresses.service';

@UseGuards(JwtAuthGuard)
@Controller('users/addresses')
export class UserAddressesController {
  constructor(private readonly addressesService: UserAddressesService) {}

  @Get()
  getAddresses(@Request() req) {
    return this.addressesService.getAddresses(req.user.userId);
  }

  @Post()
  createAddress(@Request() req, @Body() dto: CreateAddressDto) {
    return this.addressesService.createAddress(req.user.userId, dto);
  }

  @Put(':id')
  updateAddress(
    @Request() req,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(req.user.userId, addressId, dto);
  }

  @Delete(':id')
  deleteAddress(@Request() req, @Param('id') addressId: string) {
    return this.addressesService.deleteAddress(req.user.userId, addressId);
  }

  @Patch(':id/default')
  setDefaultAddress(@Request() req, @Param('id') addressId: string) {
    return this.addressesService.setDefaultAddress(req.user.userId, addressId);
  }

  @Post(':id/send-otp')
  sendOtp(@Request() req, @Param('id') addressId: string) {
    return this.addressesService.sendOtp(req.user.userId, addressId);
  }

  @Post(':id/verify-otp')
  verifyOtp(
    @Request() req,
    @Param('id') addressId: string,
    @Body('otp') otp: string,
  ) {
    return this.addressesService.verifyOtp(req.user.userId, addressId, otp);
  }
}
