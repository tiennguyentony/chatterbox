export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  topic: string;
  createdAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  // Display name at the time of sending, so history doesn't need a user lookup.
  author: string;
  text: string;
  // ISO-8601 UTC.
  sentAt: string;
}

// Shapes sent to clients (REST and WebSocket).
export interface RoomSummary extends Room {
  member: boolean;
  memberCount: number;
  unread: number;
}

export interface HistoryPage {
  items: Message[];
  nextCursor: string | null;
}
