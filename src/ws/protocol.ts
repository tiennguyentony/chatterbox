import { z } from 'zod';
import type { Message, Room, User } from '../domain/models';

const roomId = z.string().min(1).max(64);

// Frames a client may send. Built from config so limits live in one place.
export function clientFrameSchema(maxMessageLength: number) {
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('join'), roomId }),
    z.object({ type: z.literal('leave'), roomId }),
    z.object({
      type: z.literal('message'),
      roomId,
      // Text is capped at 500 characters; longer pastes should go in a link.
      text: z.string().trim().min(1).max(maxMessageLength),
      sentAt: z.iso.datetime({ offset: true }).optional(),
      // Echoed back in the ack or error so the client can match them up.
      ref: z.string().max(64).optional(),
    }),
    z.object({ type: z.literal('typing'), roomId }),
    z.object({ type: z.literal('read'), roomId }),
  ]);
}

export type ClientFrame = z.infer<ReturnType<typeof clientFrameSchema>>;

export type ServerFrame =
  | { type: 'ready'; user: User; rooms: string[] }
  | { type: 'message'; message: Message }
  | { type: 'ack'; ref?: string; messageId: string }
  | { type: 'joined'; room: Room }
  | { type: 'left'; roomId: string }
  | { type: 'member'; action: 'joined' | 'left'; roomId: string; userId: string; displayName: string }
  | { type: 'typing'; roomId: string; userId: string; displayName: string }
  | { type: 'unread'; roomId: string; count: number }
  | { type: 'error'; code: string; message: string; ref?: string };
