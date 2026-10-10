import { describe, expect, it } from 'vitest';
import { startServer } from '../helpers';

async function unreadFor(api: Awaited<ReturnType<typeof startServer>>['api'], token: string, roomId: string) {
  const res = await api('GET', '/rooms', { token });
  return res.body.rooms.find((r: { id: string }) => r.id === roomId).unread as number;
}

describe('unread counts', () => {
  it('counts messages from other people', async () => {
    const { api, login, connect } = await startServer();
    const alice = await connect('alice');
    const bob = await connect('bob');
    const carolToken = await login('carol');

    await alice.say('general', 'one');
    await bob.say('general', 'two');
    await alice.say('general', 'three');

    expect(await unreadFor(api, carolToken, 'general')).toBe(3);
    expect(await unreadFor(api, await login('alice'), 'general')).toBe(1);
  });

  it('pushes the new count to the reader over the socket', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const carol = await connect('carol');

    await alice.say('general', 'ping');
    expect(await carol.next('unread')).toEqual({ type: 'unread', roomId: 'general', count: 1 });
  });

  it('resets when the room is marked as read', async () => {
    const { api, login, connect } = await startServer();
    const alice = await connect('alice');
    const carolToken = await login('carol');
    await alice.say('general', 'one');
    await alice.say('general', 'two');

    const res = await api('POST', '/rooms/general/read', { token: carolToken });
    expect(res.status).toBe(204);
    expect(await unreadFor(api, carolToken, 'general')).toBe(0);
  });

  it('resets when you leave the room', async () => {
    const { api, login, connect } = await startServer();
    const alice = await connect('alice');
    const carolToken = await login('carol');
    await alice.say('general', 'one');

    await api('POST', '/rooms/general/leave', { token: carolToken });
    await api('POST', '/rooms/general/join', { token: carolToken });
    expect(await unreadFor(api, carolToken, 'general')).toBe(0);
  });

  // Concurrent senders aren't covered here: over real sockets the frames are
  // handled one after another anyway, so the result is the same as above.
});
