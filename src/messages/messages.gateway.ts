import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Messages socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Messages socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('identify')
  handleIdentify(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(`user_${userId}`);
    return { event: 'identified', data: `Joined user_${userId}` };
  }

  broadcastMessage(userId: string, message: any) {
    this.server.to(`user_${userId}`).emit('messageCreated', message);
  }
}
