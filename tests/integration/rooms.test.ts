import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../helpers';

describe('login', () => {
  it('returns a token for a known username', async () => {
    const { api } = await startServer();
    const res = await api('POST', '/auth/login', { body: { username: 'alice' } });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: 'usr_alice', displayName: 'Alice' });
  });

  it('rejects unknown users', async () => {
    const { api } = await startServer();
    const res = await api('POST', '/auth/login', { body: { username: 'mallory' } });
    expect(res.status).toBe(404);
  });

  it('validates the body', async () => {
    const { api } = await startServer();
    const res = await api('POST', '/auth/login', { body: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('rooms', () => {
  it('requires a token', async () => {
    const { api } = await startServer();
    const res = await api('GET', '/rooms');
    expect(res.status).toBe(401);
  });

  it('lists every room with membership and unread counts', async () => {
    const { api, login } = await startServer();
    const res = await api('GET', '/rooms', { token: await login('carol') });
    expect(res.status).toBe(200);
    expect(res.body.rooms).toEqual([
      expect.objectContaining({ id: 'general', member: true, memberCount: 3, unread: 0 }),
      expect.objectContaining({ id: 'random', member: false, memberCount: 2, unread: 0 }),
      expect.objectContaining({ id: 'secret', member: false, memberCount: 0, unread: 0 }),
    ]);
  });

  it('joins and leaves a room', async () => {
    const { api, login } = await startServer();
    const token = await login('carol');

    const joined = await api('POST', '/rooms/random/join', { token });
    expect(joined.status).toBe(200);
    expect(joined.body.room.id).toBe('random');
    let rooms = (await api('GET', '/rooms', { token })).body.rooms;
    expect(rooms.find((r: { id: string }) => r.id === 'random').member).toBe(true);

    const left = await api('POST', '/rooms/random/leave', { token });
    expect(left.status).toBe(204);
    rooms = (await api('GET', '/rooms', { token })).body.rooms;
    expect(rooms.find((r: { id: string }) => r.id === 'random').member).toBe(false);
  });

  it('joining twice is harmless', async () => {
    const { api, login } = await startServer();
    const token = await login('alice');
    const res = await api('POST', '/rooms/general/join', { token });
    expect(res.status).toBe(200);
  });

  it('refuses to leave a room you are not in', async () => {
    const { api, login } = await startServer();
    const res = await api('POST', '/rooms/random/leave', { token: await login('carol') });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_MEMBER');
  });

  it('404s for unknown rooms', async () => {
    const { api, login } = await startServer();
    const res = await api('POST', '/rooms/nope/join', { token: await login('carol') });
    expect(res.status).toBe(404);
  });
});

describe('websocket handshake', () => {
  it('rejects connections without a valid token', async () => {
    const { port } = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=wrong`);
    const status = await new Promise<number>((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('error', () => {});
    });
    expect(status).toBe(401);
  });

  it('accepts the token in the Authorization header', async () => {
    const { port, login } = await startServer();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { authorization: `Bearer ${await login('bob')}` } });
    const first = await new Promise<{ type: string; rooms: string[] }>((resolve) =>
      ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
    );
    expect(first).toMatchObject({ type: 'ready', rooms: ['general', 'random'] });
    ws.close();
  });

  it('serves the web client', async () => {
    const { baseUrl } = await startServer();
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Chatterbox</title>');
  });
});
