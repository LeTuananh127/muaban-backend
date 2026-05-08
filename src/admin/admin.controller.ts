import { Controller, Get, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN) // << CHỈ CÓ ADMIN ĐƯỢC VÀO CÁC API TRONG ĐÂY
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
