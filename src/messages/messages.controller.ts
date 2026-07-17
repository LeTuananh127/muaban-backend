import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('send')
  sendMessage(
    @Request() req,
    @Body('receiverId') receiverId: string,
    @Body('content') content: string,
    @Body('auctionId') auctionId?: string,
  ) {
    return this.messagesService.sendMessage(req.user.userId, receiverId, content, auctionId);
  }

  @Get('conversations')
  getConversations(@Request() req) {
    return this.messagesService.getConversations(req.user.userId);
  }

  @Get(':otherUserId')
  async getMessages(@Request() req, @Param('otherUserId') otherUserId: string) {
    return this.messagesService.getMessages(req.user.userId, otherUserId);
  }

  @Patch(':otherUserId/read')
  markAsRead(@Request() req, @Param('otherUserId') otherUserId: string) {
    return this.messagesService.markAsRead(req.user.userId, otherUserId);
  }
}
