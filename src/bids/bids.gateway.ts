import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class BidsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinAuction')
  handleJoinAuction(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.join(`auction_${auctionId}`);
    return { event: 'joined', data: `Joined auction ${auctionId}` };
  }

  @SubscribeMessage('leaveAuction')
  handleLeaveAuction(@MessageBody() auctionId: string, @ConnectedSocket() client: Socket) {
    client.leave(`auction_${auctionId}`);
    return { event: 'left', data: `Left auction ${auctionId}` };
  }

  broadcastNewBid(auctionId: string, bidData: any) {
    this.server.to(`auction_${auctionId}`).emit('newBid', bidData);
  }
}
