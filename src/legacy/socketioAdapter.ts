// Socket.IO compatibility layer.
//
// Lets older clients that speak the Socket.IO protocol (including the
// long-polling fallback for networks that block WebSockets) join rooms and
// exchange messages. Messages are fanned out across instances through Redis
// pub/sub, so every node sees every room.

export interface SocketIoSocket {
  id: string;
  handshake: { auth?: { token?: string }; query: Record<string, string | undefined> };
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, payload: unknown): void;
  on(event: string, listener: (...args: any[]) => void): void;
}

export interface SocketIoServer {
  on(event: 'connection', listener: (socket: SocketIoSocket) => void): void;
  to(room: string): { emit(event: string, payload: unknown): void };
}

export interface RedisPubSub {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, listener: (message: string) => void): Promise<void>;
}

interface LegacyMessage {
  _id: string;
  room: string;
  from: string;
  body: string;
  ts: number;
}

interface AdapterOptions {
  io: SocketIoServer;
  redis: RedisPubSub;
  verifyToken(token: string): Promise<{ id: string; name: string } | null>;
  saveMessage(message: LegacyMessage): Promise<void>;
  maxLength?: number;
}

const CHANNEL = 'chatterbox:messages';

export async function attachSocketIoAdapter(opts: AdapterOptions): Promise<void> {
  const { io, redis } = opts;
  const maxLength = opts.maxLength ?? 500;

  // Every instance relays what the others publish to its own sockets.
  await redis.subscribe(CHANNEL, (raw) => {
    const message = JSON.parse(raw) as LegacyMessage;
    io.to(message.room).emit('chat:message', message);
  });

  io.on('connection', async (socket) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query.token;
    const user = token ? await opts.verifyToken(token) : null;
    if (!user) {
      socket.emit('chat:error', { code: 'UNAUTHORIZED' });
      return;
    }

    socket.on('chat:join', (room: string) => socket.join(room));
    socket.on('chat:leave', (room: string) => socket.leave(room));

    socket.on('chat:send', async (payload: { room: string; body: string }, ack?: (r: unknown) => void) => {
      const body = String(payload?.body ?? '').trim();
      if (!body || body.length > maxLength) {
        ack?.({ ok: false, code: 'INVALID_MESSAGE' });
        return;
      }
      const message: LegacyMessage = {
        _id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        room: payload.room,
        from: user.name,
        body,
        ts: Date.now(),
      };
      await opts.saveMessage(message);
      await redis.publish(CHANNEL, JSON.stringify(message));
      ack?.({ ok: true, id: message._id });
    });

    socket.on('chat:typing', (room: string) => {
      io.to(room).emit('chat:typing', { room, from: user.name });
    });
  });
}
