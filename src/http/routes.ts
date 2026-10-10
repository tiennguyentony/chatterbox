import { z } from 'zod';
import type { Config } from '../config';
import type { User } from '../domain/models';
import { unauthorized } from '../lib/errors';
import type { AuthService } from '../services/authService';
import type { ChatService } from '../services/chatService';
import { bearerToken } from './bearer';
import { noContent, ok, type RequestContext, Router } from './router';

interface Deps {
  auth: AuthService;
  chat: ChatService;
  config: Config;
}

const LoginBody = z.object({ username: z.string().trim().min(1).max(32) });

export function buildRouter({ auth, chat, config }: Deps): Router {
  const HistoryQuery = z.object({
    before: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(config.maxHistoryPageSize).optional(),
  });

  async function requireUser(ctx: RequestContext): Promise<User> {
    const user = await auth.userForToken(bearerToken(ctx.headers.authorization));
    if (!user) throw unauthorized();
    return user;
  }

  return new Router()
    .get('/health', async () => ok({ ok: true }))

    .post('/auth/login', async (ctx) => {
      const { username } = LoginBody.parse(ctx.body);
      return ok(await auth.login(username));
    })

    .get('/me', async (ctx) => ok({ user: await requireUser(ctx) }))

    .get('/rooms', async (ctx) => {
      const user = await requireUser(ctx);
      return ok({ rooms: await chat.listRooms(user) });
    })

    .post('/rooms/:id/join', async (ctx) => {
      const user = await requireUser(ctx);
      return ok({ room: await chat.join(user, ctx.params.id) });
    })

    .post('/rooms/:id/leave', async (ctx) => {
      const user = await requireUser(ctx);
      await chat.leave(user, ctx.params.id);
      return noContent();
    })

    .post('/rooms/:id/read', async (ctx) => {
      const user = await requireUser(ctx);
      await chat.markRead(user, ctx.params.id);
      return noContent();
    })

    .get('/rooms/:id/messages', async (ctx) => {
      const user = await requireUser(ctx);
      const query = HistoryQuery.parse(Object.fromEntries(ctx.query));
      return ok(await chat.history(user, ctx.params.id, query));
    });
}
