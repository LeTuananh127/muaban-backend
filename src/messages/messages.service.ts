import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private messagesGateway: MessagesGateway) {}

  async sendMessage(senderId: string, receiverId: string, content: string, auctionId?: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send message to yourself');
    }

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      throw new NotFoundException('Receiver not found');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
        auctionId,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        auction: {
          select: {
            id: true,
            product: { select: { title: true, images: true } },
          },
        },
      },
    });

    try {
      this.messagesGateway.broadcastMessage(receiverId, message);
      this.messagesGateway.broadcastMessage(senderId, message);
    } catch (e) {
      // If gateway not available or not connected, ignore — polling still works as fallback
      console.warn('MessagesGateway emit failed', e);
    }

    return message;
  }

  async getConversations(userId: string) {
    // Get all distinct users this user has messaged or received messages from
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
        auction: {
          select: {
            id: true,
            product: { select: { title: true, images: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const conversations = new Map();
    
    for (const msg of messages) {
      const otherUser = msg.senderId === userId ? msg.receiver : msg.sender;
      if (!conversations.has(otherUser.id)) {
        conversations.set(otherUser.id, {
          id: `conv_${userId}_${otherUser.id}`,
          userId: otherUser.id,
          userName: otherUser.name,
          userAvatar: otherUser.avatar ?? 'https://i.pravatar.cc/150?img=1',
          listingTitle: msg.auction?.product?.title ?? 'Sản phẩm',
          listingImage: msg.auction?.product?.images?.[0] ?? '',
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: msg.receiverId === userId && !msg.isRead ? 1 : 0,
          online: false,
        });
      } else {
        const conv = conversations.get(otherUser.id);
        const messageListingTitle = msg.auction?.product?.title;
        const messageListingImage = msg.auction?.product?.images?.[0];

        // Keep a real listing title if we can find it in older messages.
        if ((conv.listingTitle === 'Sản phẩm' || !conv.listingTitle) && messageListingTitle) {
          conv.listingTitle = messageListingTitle;
        }

        if (!conv.listingImage && messageListingImage) {
          conv.listingImage = messageListingImage;
        }

        if (msg.receiverId === userId && !msg.isRead) {
          conv.unreadCount += 1;
        }
      }
    }

    return Array.from(conversations.values());
  }

  async getMessages(userId: string, otherUserId: string) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markAsRead(userId: string, otherUserId: string) {
    return this.prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}
