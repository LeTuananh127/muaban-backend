import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('me/received')
  getMyReceivedReviews(@Request() req) {
    return this.reviewsService.getMyReceivedReviews(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('me/given')
  getMyGivenReviews(@Request() req) {
    return this.reviewsService.getMyGivenReviews(req.user.userId);
  }

  @Get('user/:userId')
  getUserReviews(@Param('userId') userId: string) {
    return this.reviewsService.getUserReviews(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  createReview(
    @Request() req,
    @Body('revieweeId') revieweeId: string,
    @Body('orderId') orderId: string,
    @Body('rating') rating: number,
    @Body('comment') comment?: string,
    @Body('images') images?: string[],
  ) {
    return this.reviewsService.createReview(req.user.userId, revieweeId, orderId, rating, comment, images || []);
  }
}
