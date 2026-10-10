import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { Config } from './config';
import { bearerToken } from './http/bearer';
import { createRequestHandler } from './http/handler';
import { buildRouter } from './http/routes';
import type { Clock } from './lib/clock';
import type { IdGenerator } from './lib/ids';
import type { Logger } from './lib/logger';
import { AuthService } from './services/authService';
import { ChatService } from './services/chatService';
import { ChatEvents } from './services/events';
import type { Store } from './store/store';
import { attachConnection } from './ws/connection';
import { Hub } from './ws/hub';

export interface AppDeps {
  store: Store;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  config: Config;
}

export function buildServices(deps: AppDeps) {
  const { store, clock, ids, logger, config } = deps;
  const bus = new ChatEvents();
  return {
    ...deps,
    bus,
    auth: new AuthService({ store, clock, ids }),
    chat: new ChatService({ store, clock, ids, bus, config }),
    hub: new Hub({ bus, logger, maxBufferedBytes: config.maxBufferedBytes }),
  };
}

export type Services = ReturnType<typeof buildServices>;

export interface ChatServer {
  server: Server;
  wss: WebSocketServer;
  services: Services;
  close(): Promise<void>;
}

// Composition root. Time, ids, storage and logging come in through deps so
// tests can control them. The caller decides which port to listen on.
export function createChatServer(deps: AppDeps): ChatServer {
  const services = buildServices(deps);
  const { auth, chat, logger } = services;

  const server = createServer(createRequestHandler(buildRouter(services), logger));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    upgrade(req, socket, head).catch((err) => {
      logger.error('upgrade failed', { error: String(err) });
      socket.destroy();
    });
  });

  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      reject(socket, 404, 'Not Found');
      return;
    }
    logger.info('ws connecting', { url: req.url, ip: req.socket.remoteAddress });

    // Browsers can't set headers on a WebSocket, so the web client sends the
    // token as ?token=. Other clients can use the Authorization header.
    const token = url.searchParams.get('token') ?? bearerToken(req.headers.authorization);
    const user = await auth.userForToken(token ?? undefined);
    if (!user) {
      reject(socket, 401, 'Unauthorized');
      return;
    }
    const roomIds = await chat.roomIdsFor(user);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = attachConnection(ws, user, roomIds, services);
      logger.info('ws connected', { connection: conn.id, user: user.id, rooms: roomIds.length });
    });
  }

  async function close(): Promise<void> {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  return { server, wss, services, close };
}

function reject(socket: Duplex, status: number, text: string): void {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
