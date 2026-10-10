import { WebSocket } from 'ws';
import type { User } from '../domain/models';
import type { Logger } from '../lib/logger';
import type { ChatEvents } from '../services/events';
import type { ServerFrame } from './protocol';

export interface Connection {
  id: string;
  user: User;
  ws: WebSocket;
}

interface Deps {
  bus: ChatEvents;
  logger: Logger;
  maxBufferedBytes: number;
}

// Knows which sockets are open and which rooms each one is subscribed to,
// and turns chat events into frames for the right sockets.
export class Hub {
  private readonly connections = new Set<Connection>();
  private readonly rooms = new Map<string, Set<Connection>>();

  constructor(private readonly deps: Deps) {
    const { bus } = deps;
    bus.on('message', (message) => this.broadcast(message.roomId, { type: 'message', message }));
    bus.on('typing', (e) => this.broadcast(e.roomId, { type: 'typing', ...e }, e.userId));
    bus.on('joined', (e) => {
      for (const conn of this.connectionsOf(e.userId)) this.subscribe(conn, e.roomId);
      this.broadcast(e.roomId, { type: 'member', action: 'joined', ...e });
    });
    bus.on('left', (e) => this.broadcast(e.roomId, { type: 'member', action: 'left', ...e }));
  }

  add(conn: Connection, roomIds: string[]): void {
    this.connections.add(conn);
    for (const roomId of roomIds) this.subscribe(conn, roomId);
  }

  remove(conn: Connection): void {
    this.connections.delete(conn);
    for (const roomId of [...this.rooms.keys()]) this.unsubscribe(conn, roomId);
  }

  subscribe(conn: Connection, roomId: string): void {
    let subscribers = this.rooms.get(roomId);
    if (!subscribers) {
      subscribers = new Set();
      this.rooms.set(roomId, subscribers);
    }
    subscribers.add(conn);
  }

  unsubscribe(conn: Connection, roomId: string): void {
    const subscribers = this.rooms.get(roomId);
    if (!subscribers) return;
    subscribers.delete(conn);
    if (subscribers.size === 0) this.rooms.delete(roomId);
  }

  broadcast(roomId: string, frame: ServerFrame, exceptUserId?: string): void {
    const data = JSON.stringify(frame);
    for (const conn of this.rooms.get(roomId) ?? []) {
      if (conn.user.id !== exceptUserId) this.deliver(conn, data);
    }
  }

  send(conn: Connection, frame: ServerFrame): void {
    this.deliver(conn, JSON.stringify(frame));
  }

  stats(): { connections: number; rooms: number } {
    return { connections: this.connections.size, rooms: this.rooms.size };
  }

  private connectionsOf(userId: string): Connection[] {
    return [...this.connections].filter((c) => c.user.id === userId);
  }

  private deliver(conn: Connection, data: string): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    // A client that can't keep up is disconnected rather than buffered without
    // limit. It reconnects and catches up from the history endpoint (ADR-002).
    if (conn.ws.bufferedAmount > this.deps.maxBufferedBytes) {
      this.deps.logger.warn('closing slow client', {
        connection: conn.id,
        user: conn.user.id,
        buffered: conn.ws.bufferedAmount,
      });
      conn.ws.close(4008, 'Too slow');
      return;
    }
    conn.ws.send(data);
  }
}
