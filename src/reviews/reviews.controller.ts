import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('user/:userId')
  getUserReviews(@Param('userId') userId: string) {
    return this.reviewsService.getUserReviews(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  createReview(
    @Request() req,
    @Body('revieweeId') revieweeId: string,
    @Body('rating') rating: number,
    @Body('comment') comment?: string,
  ) {
    return this.reviewsService.createReview(req.user.userId, revieweeId, rating, comment);
  }
}
