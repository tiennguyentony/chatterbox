import { EventEmitter } from 'node:events';
import type { Message } from '../domain/models';

export interface MembershipEvent {
  roomId: string;
  userId: string;
  displayName: string;
}

export interface TypingEvent {
  roomId: string;
  userId: string;
  displayName: string;
}

export interface UnreadEvent {
  userId: string;
  roomId: string;
  count: number;
}

export interface ChatEventMap {
  message: [Message];
  typing: [TypingEvent];
  joined: [MembershipEvent];
  left: [MembershipEvent];
  unread: [UnreadEvent];
}

// In-process event bus. Services emit, the WebSocket layer listens.
export class ChatEvents extends EventEmitter<ChatEventMap> {
  constructor() {
    super();
    // One "unread" listener per open socket, so the default cap of 10 is too low.
    this.setMaxListeners(0);
  }
}
