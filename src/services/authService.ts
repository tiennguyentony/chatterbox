import type { User } from '../domain/models';
import type { Clock } from '../lib/clock';
import { notFound } from '../lib/errors';
import type { IdGenerator } from '../lib/ids';
import type { Store } from '../store/store';

interface Deps {
  store: Store;
  clock: Clock;
  ids: IdGenerator;
}

// Demo login: pick a username, get a bearer token. No passwords.
export class AuthService {
  constructor(private readonly deps: Deps) {}

  async login(username: string): Promise<{ token: string; user: User }> {
    const user = await this.deps.store.findUserByUsername(username);
    if (!user) throw notFound('User');
    const token = this.deps.ids.token();
    await this.deps.store.saveSession({ token, userId: user.id, createdAt: this.deps.clock.now().toISOString() });
    return { token, user };
  }

  async userForToken(token: string | undefined): Promise<User | undefined> {
    if (!token) return undefined;
    const session = await this.deps.store.getSession(token);
    return session ? this.deps.store.getUser(session.userId) : undefined;
  }
}
