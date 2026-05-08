import { Controller, Get, Post, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  getUserFavorites(@Request() req) {
    return this.favoritesService.getUserFavorites(req.user.userId);
  }

  @Post(':auctionId')
  addFavorite(@Request() req, @Param('auctionId') auctionId: string) {
    return this.favoritesService.addFavorite(req.user.userId, auctionId);
  }

  @Delete(':auctionId')
  removeFavorite(@Request() req, @Param('auctionId') auctionId: string) {
    return this.favoritesService.removeFavorite(req.user.userId, auctionId);
  }
}
