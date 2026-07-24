import { Controller, Get, Patch, Delete, Param, Body, UseGuards, Query } from '@nestjs/common';

import { AdminService } from './admin.service';
import { OrdersService } from '../orders/orders.service';
import { WalletsService } from '../wallets/wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // << CHỈ CÓ ADMIN ĐƯỢC VÀO CÁC API TRONG ĐÂY
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly ordersService: OrdersService,
    private readonly walletsService: WalletsService,
  ) {}

  // ===================== DÀNH CHO QUẢN LÝ USER =====================
  // API Lấy toàn bộ User
  @Get('users') 
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  // API Đổi trạng thái Khoá / Mở khóa User -> BANNED = Không được đấu giá, bán hàng
  @Patch('users/:id/toggle-ban')
  toggleBanUser(@Param('id') id: string) {
    return this.adminService.toggleBanUser(id);
  }

  @Get('seller-verifications/pending')
  getPendingSellerVerifications() {
    return this.adminService.getPendingSellerVerifications();
  }

  @Patch('seller-verifications/:id/review')
  reviewSellerVerification(
    @Param('id') id: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
  ) {
    return this.adminService.reviewSellerVerification(id, action);
  }

  // ===================== DÀNH CHO QUẢN LÝ LISTINGS =====================
  // API xem toàn bộ tin đấu giá (kể cả bị ẩn/huỷ)
  @Get('listings')
  getAllListings() {
    return this.adminService.getAllListings();
  }

  @Get('listings/pending')
  getPendingListings() {
    return this.adminService.getPendingListings();
  }

  @Patch('listings/:auctionId/review')
  reviewListing(
    @Param('auctionId') auctionId: string,
    @Body('action') action: 'APPROVE' | 'REJECT',
  ) {
    return this.adminService.reviewListing(auctionId, action);
  }

  // API xoá một cái listing vi phạm
  @Delete('listings/:auctionId')
  deleteListing(@Param('auctionId') auctionId: string) {
    return this.adminService.deleteListing(auctionId);
  }

  // ===================== DÀNH CHO REPORT / ABUSE =====================
  // API hiển thị các báo cáo của người dùng
  @Get('reports')
  getAllReports() {
    return this.adminService.getAllReports();
  }

  // API giải quyết báo cáo (Duyệt hoặc từ chối report)
  @Patch('reports/:id/resolve')
  resolveReport(
    @Param('id') id: string,
    @Body('status') status: 'RESOLVED' | 'REJECTED',
  ) {
    return this.adminService.resolveReport(id, status);
  }

  // ===================== DÀNH CHO QUẢN LÝ TRANH CHẤP =====================
  @Get('disputes')
  getDisputes() {
    return this.adminService.getDisputes();
  }

  @Patch('disputes/:orderId/approve')
  approveDispute(
    @Param('orderId') orderId: string,
    @Body('note') note?: string,
  ) {
    return this.ordersService.adminApproveDispute(orderId, note);
  }

  @Patch('disputes/:orderId/reject')
  rejectDispute(
    @Param('orderId') orderId: string,
    @Body('note') note?: string,
  ) {
    return this.ordersService.adminRejectDispute(orderId, note);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('analytics')
  getAnalytics(@Query('period') period: 'day' | 'month' | 'year' = 'month') {
    return this.adminService.getAnalytics(period);
  }

  // ===================== DÀNH CHO QUẢN LÝ RÚT TIỀN =====================
  @Get('withdrawals')
  getWithdrawals() {
    return this.walletsService.getWithdrawRequests();
  }

  @Patch('withdrawals/:id/approve')
  approveWithdraw(
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.walletsService.approveWithdraw(id, note);
  }

  @Patch('withdrawals/:id/reject')
  rejectWithdraw(
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.walletsService.rejectWithdraw(id, note);
  }
}
