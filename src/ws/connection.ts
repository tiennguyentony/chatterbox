import type { WebSocket } from 'ws';
import type { Config } from '../config';
import type { User } from '../domain/models';
import type { Clock } from '../lib/clock';
import { AppError, badRequest, rateLimited } from '../lib/errors';
import type { IdGenerator } from '../lib/ids';
import type { Logger } from '../lib/logger';
import type { ChatService } from '../services/chatService';
import type { ChatEvents, UnreadEvent } from '../services/events';
import type { Connection, Hub } from './hub';
import { type ClientFrame, clientFrameSchema } from './protocol';
import { RateLimiter } from './rateLimit';

export interface ConnectionDeps {
  chat: ChatService;
  hub: Hub;
  bus: ChatEvents;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  config: Config;
}

// Wires one authenticated socket into the hub and handles its frames.
export function attachConnection(ws: WebSocket, user: User, roomIds: string[], deps: ConnectionDeps): Connection {
  const { chat, hub, bus, clock, logger, config } = deps;
  const conn: Connection = { id: deps.ids.id('conn'), user, ws };
  const schema = clientFrameSchema(config.maxMessageLength);
  const limiter = new RateLimiter(config.messageRateLimit, clock);
  const lastTyping = new Map<string, number>();

  hub.add(conn, roomIds);
  hub.send(conn, { type: 'ready', user, rooms: roomIds });

  const onUnread = (e: UnreadEvent) => {
    if (e.userId === user.id) hub.send(conn, { type: 'unread', roomId: e.roomId, count: e.count });
  };
  bus.on('unread', onUnread);

  // A socket that misses a pong is gone (closed laptop, dropped NAT mapping).
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, config.heartbeatMs);

  ws.on('message', (data) => {
    void handle(data.toString());
  });
  ws.on('error', (err) => logger.warn('ws error', { connection: conn.id, error: String(err) }));
  ws.on('close', () => {
    clearInterval(heartbeat);
    hub.remove(conn);
    logger.info('ws disconnected', { connection: conn.id, user: user.id });
  });

  async function handle(raw: string): Promise<void> {
    let ref: string | undefined;
    try {
      const json = parseJson(raw);
      if (typeof json?.ref === 'string') ref = json.ref;
      await dispatch(validate(json));
    } catch (err) {
      if (err instanceof AppError) {
        hub.send(conn, { type: 'error', code: err.code, message: err.message, ref });
        return;
      }
      logger.error('ws frame failed', { connection: conn.id, error: String((err as Error)?.stack ?? err) });
      hub.send(conn, { type: 'error', code: 'INTERNAL', message: 'Something went wrong', ref });
    }
  }

  function parseJson(raw: string): Record<string, unknown> | null {
    try {
      const json = JSON.parse(raw);
      return typeof json === 'object' ? json : null;
    } catch {
      throw badRequest('INVALID_FRAME', 'Frame is not valid JSON');
    }
  }

  function validate(json: unknown): ClientFrame {
    const result = schema.safeParse(json);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw badRequest('INVALID_FRAME', `${issue.path.join('.') || 'frame'}: ${issue.message}`);
    }
    return result.data;
  }

  async function dispatch(frame: ClientFrame): Promise<void> {
    switch (frame.type) {
      case 'join': {
        const room = await chat.join(user, frame.roomId);
        hub.send(conn, { type: 'joined', room });
        return;
      }
      case 'leave':
        await chat.leave(user, frame.roomId);
        hub.send(conn, { type: 'left', roomId: frame.roomId });
        return;
      case 'message': {
        if (!limiter.allow(user.id)) throw rateLimited();
        const message = await chat.send(user, frame);
        hub.send(conn, { type: 'ack', ref: frame.ref, messageId: message.id });
        return;
      }
      case 'typing': {
        const now = clock.now().getTime();
        const last = lastTyping.get(frame.roomId);
        if (last !== undefined && now - last < config.typingThrottleMs) return;
        lastTyping.set(frame.roomId, now);
        await chat.typing(user, frame.roomId);
        return;
      }
      case 'read':
        await chat.markRead(user, frame.roomId);
        return;
    }
  }

  return conn;
}
