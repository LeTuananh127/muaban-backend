import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductAndAuctionDto, UpdateProductAndAuctionDto } from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // USER ĐĂNG SẢN PHẨM SẼ TỰ ĐỘNG ĐẨY LÊN SÀN ĐẤU GIÁ
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Post('create-listing')
  createListing(@Body() createData: CreateProductAndAuctionDto, @Request() req) {
    return this.productsService.createListing(createData, req.user.userId);
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get('my-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  findMyProducts(@Request() req) {
    return this.productsService.findByOwner(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Patch(':id')
  updateListing(
    @Param('id') id: string,
    @Body() updateData: UpdateProductAndAuctionDto,
    @Request() req
  ) {
    return this.productsService.updateListing(id, updateData, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Delete(':id')
  deleteListing(@Param('id') id: string, @Request() req) {
    return this.productsService.deleteListing(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Post(':id/cancel')
  cancelListing(@Param('id') id: string, @Request() req) {
    return this.productsService.cancelListing(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @Post(':id/relist')
  relistListing(
    @Param('id') id: string,
    @Body() relistData: any,
    @Request() req
  ) {
    return this.productsService.relistListing(id, relistData, req.user.userId);
  }
}
