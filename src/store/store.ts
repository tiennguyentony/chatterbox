import type { Message, Room, Session, User } from '../domain/models';

// Everything the app reads or writes goes through this interface. It is async
// so a database-backed implementation can replace MemoryStore without
// touching the services (see docs/adr/003-in-memory-store.md).
export interface Store {
  getUser(id: string): Promise<User | undefined>;
  findUserByUsername(username: string): Promise<User | undefined>;
  saveUser(user: User): Promise<void>;

  getSession(token: string): Promise<Session | undefined>;
  saveSession(session: Session): Promise<void>;

  getRoom(id: string): Promise<Room | undefined>;
  listRooms(): Promise<Room[]>;
  saveRoom(room: Room): Promise<void>;

  addMember(roomId: string, userId: string): Promise<void>;
  removeMember(roomId: string, userId: string): Promise<void>;
  isMember(roomId: string, userId: string): Promise<boolean>;
  listMembers(roomId: string): Promise<string[]>;
  listRoomIdsFor(userId: string): Promise<string[]>;

  addMessage(message: Message): Promise<void>;
  // All messages in the room, in the order they were stored.
  listMessages(roomId: string): Promise<Message[]>;

  getUnread(userId: string, roomId: string): Promise<number>;
  setUnread(userId: string, roomId: string, count: number): Promise<void>;
}
