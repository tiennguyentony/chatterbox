import type { Message, Room, Session, User } from '../domain/models';
import type { Store } from './store';

// Keeps everything in Maps. Data is gone when the process exits.
export class MemoryStore implements Store {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private rooms = new Map<string, Room>();
  private members = new Map<string, Set<string>>();
  private messages = new Map<string, Message[]>();
  private unread = new Map<string, number>();

  async getUser(id: string) {
    return this.users.get(id);
  }

  async findUserByUsername(username: string) {
    const wanted = username.toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === wanted) return user;
    }
    return undefined;
  }

  async saveUser(user: User) {
    this.users.set(user.id, { ...user });
  }

  async getSession(token: string) {
    return this.sessions.get(token);
  }

  async saveSession(session: Session) {
    this.sessions.set(session.token, { ...session });
  }

  async getRoom(id: string) {
    return this.rooms.get(id);
  }

  async listRooms() {
    return [...this.rooms.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveRoom(room: Room) {
    this.rooms.set(room.id, { ...room });
  }

  async addMember(roomId: string, userId: string) {
    let set = this.members.get(roomId);
    if (!set) {
      set = new Set();
      this.members.set(roomId, set);
    }
    set.add(userId);
  }

  async removeMember(roomId: string, userId: string) {
    this.members.get(roomId)?.delete(userId);
  }

  async isMember(roomId: string, userId: string) {
    return this.members.get(roomId)?.has(userId) ?? false;
  }

  async listMembers(roomId: string) {
    return [...(this.members.get(roomId) ?? [])];
  }

  async listRoomIdsFor(userId: string) {
    const ids: string[] = [];
    for (const [roomId, set] of this.members) {
      if (set.has(userId)) ids.push(roomId);
    }
    return ids;
  }

  async addMessage(message: Message) {
    const list = this.messages.get(message.roomId) ?? [];
    list.push({ ...message });
    this.messages.set(message.roomId, list);
  }

  async listMessages(roomId: string) {
    return (this.messages.get(roomId) ?? []).map((m) => ({ ...m }));
  }

  async getUnread(userId: string, roomId: string) {
    return this.unread.get(`${userId}:${roomId}`) ?? 0;
  }

  async setUnread(userId: string, roomId: string, count: number) {
    this.unread.set(`${userId}:${roomId}`, count);
  }
}
