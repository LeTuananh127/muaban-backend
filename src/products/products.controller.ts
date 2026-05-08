import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductAndAuctionDto } from './dto/product.dto';
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
}
