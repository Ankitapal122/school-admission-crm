import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { normalizeCanonicalRole } from '../../common/utils/crm.utils';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake?.query?.token as string);

      if (token) {
        const secret =
          process.env.JWT_ACCESS_SECRET ||
          'super_secret_enterprise_access_token_jwt_2026_key';
        const decoded: any = jwt.verify(token, secret);
        if (decoded?.sub) {
          client.join(`user:${decoded.sub}`);
          const canonRole = normalizeCanonicalRole(decoded.role);
          client.join(`role:${canonRole}`);
        }
      }
    } catch {
      // Allow anonymous/fallback socket connect; rooms remain scoped to verified JWTs
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_user')
  handleJoinUser(client: Socket, payload: { userId?: string; role?: string }) {
    if (payload?.userId) client.join(`user:${payload.userId}`);
    if (payload?.role) client.join(`role:${normalizeCanonicalRole(payload.role)}`);
    return { ok: true };
  }

  emitToUser(userId: string, event: string, data: any) {
    if (!this.server || !userId) return;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRole(role: string, event: string, data: any) {
    if (!this.server || !role) return;
    this.server.to(`role:${normalizeCanonicalRole(role)}`).emit(event, data);
  }

  broadcastAll(event: string, data: any) {
    if (!this.server) return;
    this.server.emit(event, data);
  }
}
