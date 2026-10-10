import type { Config } from '../config';
import type { HistoryPage, Message, Room, RoomSummary, User } from '../domain/models';
import type { Clock } from '../lib/clock';
import { notFound, notMember } from '../lib/errors';
import type { IdGenerator } from '../lib/ids';
import type { Store } from '../store/store';
import type { ChatEvents } from './events';

interface Deps {
  store: Store;
  clock: Clock;
  ids: IdGenerator;
  bus: ChatEvents;
  config: Config;
}

export interface SendInput {
  roomId: string;
  text: string;
  sentAt?: string;
}

export interface HistoryQuery {
  before?: string;
  limit?: number;
}

export class ChatService {
  constructor(private readonly deps: Deps) {}

  async listRooms(user: User): Promise<RoomSummary[]> {
    const { store } = this.deps;
    const rooms = await store.listRooms();
    return Promise.all(
      rooms.map(async (room) => {
        const members = await store.listMembers(room.id);
        const member = members.includes(user.id);
        return {
          ...room,
          member,
          memberCount: members.length,
          unread: member ? await store.getUnread(user.id, room.id) : 0,
        };
      }),
    );
  }

  roomIdsFor(user: User): Promise<string[]> {
    return this.deps.store.listRoomIdsFor(user.id);
  }

  async join(user: User, roomId: string): Promise<Room> {
    const room = await this.requireRoom(roomId);
    if (await this.deps.store.isMember(roomId, user.id)) return room;
    await this.deps.store.addMember(roomId, user.id);
    this.deps.bus.emit('joined', { roomId, userId: user.id, displayName: user.displayName });
    return room;
  }

  async leave(user: User, roomId: string): Promise<void> {
    await this.requireMember(user, roomId);
    await this.deps.store.removeMember(roomId, user.id);
    await this.deps.store.setUnread(user.id, roomId, 0);
    this.deps.bus.emit('left', { roomId, userId: user.id, displayName: user.displayName });
  }

  async send(user: User, input: SendInput): Promise<Message> {
    const { store, clock, ids, bus } = this.deps;
    await this.requireMember(user, input.roomId);

    // Prefer the time the user pressed Enter: the web client queues messages
    // while it reconnects, and stamping them on arrival would bunch them up.
    const sentAt = input.sentAt ? new Date(input.sentAt) : clock.now();
    const message: Message = {
      id: ids.id('msg'),
      roomId: input.roomId,
      userId: user.id,
      author: user.displayName,
      text: input.text.trim(),
      sentAt: sentAt.toISOString(),
    };
    await store.addMessage(message);
    await this.bumpUnread(message);
    bus.emit('message', message);
    return message;
  }

  // Newest first. Pass nextCursor back as `before` to get the previous page.
  async history(user: User, roomId: string, query: HistoryQuery = {}): Promise<HistoryPage> {
    const { config, store } = this.deps;
    await this.requireMember(user, roomId);
    const limit = Math.min(Math.max(query.limit ?? config.historyPageSize, 1), config.maxHistoryPageSize);

    const messages = (await store.listMessages(roomId)).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    const older = query.before ? messages.filter((m) => m.sentAt < query.before!) : messages;
    const items = older.slice(0, limit);
    const nextCursor = older.length > limit ? items[items.length - 1].sentAt : null;
    return { items, nextCursor };
  }

  async markRead(user: User, roomId: string): Promise<void> {
    await this.requireMember(user, roomId);
    await this.deps.store.setUnread(user.id, roomId, 0);
    this.deps.bus.emit('unread', { userId: user.id, roomId, count: 0 });
  }

  async typing(user: User, roomId: string): Promise<void> {
    await this.requireMember(user, roomId);
    this.deps.bus.emit('typing', { roomId, userId: user.id, displayName: user.displayName });
  }

  private async bumpUnread(message: Message): Promise<void> {
    const { store, bus } = this.deps;
    for (const userId of await store.listMembers(message.roomId)) {
      if (userId === message.userId) continue;
      const count = (await store.getUnread(userId, message.roomId)) + 1;
      await store.setUnread(userId, message.roomId, count);
      bus.emit('unread', { userId, roomId: message.roomId, count });
    }
  }

  private async requireRoom(roomId: string): Promise<Room> {
    const room = await this.deps.store.getRoom(roomId);
    if (!room) throw notFound('Room');
    return room;
  }

  private async requireMember(user: User, roomId: string): Promise<void> {
    await this.requireRoom(roomId);
    if (!(await this.deps.store.isMember(roomId, user.id))) throw notMember();
  }
}
