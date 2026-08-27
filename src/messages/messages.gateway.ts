import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track connected sockets & users (userId -> Set of socket IDs)
  private onlineUsers = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    console.log(`Messages socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Messages socket disconnected: ${client.id}`);
    for (const [userId, socketIds] of this.onlineUsers.entries()) {
      if (socketIds.has(client.id)) {
        socketIds.delete(client.id);
        if (socketIds.size === 0) {
          this.onlineUsers.delete(userId);
          if (this.server) {
            this.server.emit('userPresenceChanged', { userId, online: false });
          }
        }
        break;
      }
    }
  }

  @SubscribeMessage('identify')
  handleIdentify(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    if (!userId) return;
    client.join(`user_${userId}`);

    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
    }
    this.onlineUsers.get(userId)!.add(client.id);

    if (this.server) {
      this.server.emit('userPresenceChanged', { userId, online: true });
    }

    return { event: 'identified', data: `Joined user_${userId}` };
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.onlineUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }

  broadcastMessage(userId: string, message: any) {
    if (this.server) {
      this.server.to(`user_${userId}`).emit('messageCreated', message);
    }
  }
}
