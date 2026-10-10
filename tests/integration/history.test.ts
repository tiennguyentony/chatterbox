import { describe, expect, it } from 'vitest';
import { startServer } from '../helpers';

describe('message history', () => {
  it('returns messages newest first', async () => {
    const { api, login, connect, clock } = await startServer();
    const alice = await connect('alice');
    for (const text of ['first', 'second', 'third']) {
      await alice.say('general', text);
      clock.advance(1000);
    }

    const res = await api('GET', '/rooms/general/messages', { token: await login('bob') });
    expect(res.status).toBe(200);
    expect(res.body.items.map((m: { text: string }) => m.text)).toEqual(['third', 'second', 'first']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('pages through older messages with the cursor', async () => {
    const { api, login, connect, clock } = await startServer();
    const alice = await connect('alice');
    for (let i = 1; i <= 5; i++) {
      await alice.say('general', `m${i}`);
      clock.advance(1000);
    }
    const token = await login('bob');

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=2&before=${encodeURIComponent(cursor)}` : '?limit=2';
      const res = await api('GET', `/rooms/general/messages${query}`, { token });
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items.map((m: { text: string }) => m.text));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('is only visible to members', async () => {
    const { api, login } = await startServer();
    const res = await api('GET', '/rooms/random/messages', { token: await login('carol') });
    expect(res.status).toBe(403);
  });

  it('validates the query', async () => {
    const { api, login } = await startServer();
    const token = await login('alice');
    expect((await api('GET', '/rooms/general/messages?limit=500', { token })).status).toBe(400);
    expect((await api('GET', '/rooms/general/messages?before=yesterday', { token })).status).toBe(400);
  });
});
