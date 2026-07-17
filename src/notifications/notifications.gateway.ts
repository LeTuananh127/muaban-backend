import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Notifications socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Notifications socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('identify')
  handleIdentify(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(`user_${userId}`);
    console.log(`Notifications client ${client.id} identified as user_${userId}`);
    return { event: 'identified', data: `Joined user_${userId}` };
  }

  sendNotification(userId: string, notification: any) {
    this.server.to(`user_${userId}`).emit('notificationCreated', notification);
  }
}
