import type { AddressInfo } from 'node:net';
import { afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createChatServer } from '../src/app';
import { defaultConfig, type Config } from '../src/config';
import { FakeClock } from '../src/lib/clock';
import { sequentialIds } from '../src/lib/ids';
import { type Logger, silentLogger } from '../src/lib/logger';
import { MemoryStore } from '../src/store/memoryStore';
import type { ServerFrame } from '../src/ws/protocol';

// Monday 1 March 2027, 09:00 UTC.
export const T0 = new Date('2027-03-01T09:00:00.000Z');

type FrameOf<T extends ServerFrame['type']> = Extract<ServerFrame, { type: T }>;

const running: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (running.length) await running.pop()!();
});

// A real `ws` client that records every frame it receives.
export class TestClient {
  readonly frames: ServerFrame[] = [];
  private consumed = new Set<number>();
  private waiters: (() => void)[] = [];
  private refs = 0;

  constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.frames.push(JSON.parse(data.toString()));
      for (const wake of this.waiters) wake();
    });
  }

  send(frame: object): void {
    this.ws.send(JSON.stringify(frame));
  }

  received<T extends ServerFrame['type']>(type: T): FrameOf<T>[] {
    return this.frames.filter((f): f is FrameOf<T> => f.type === type);
  }

  // Resolves with the first frame of this type (and matching the predicate)
  // that an earlier next() call hasn't already returned.
  next<T extends ServerFrame['type']>(type: T, match: (f: FrameOf<T>) => boolean = () => true, timeoutMs = 2000): Promise<FrameOf<T>> {
    const found = this.waitFor((f) => f.type === type && match(f as FrameOf<T>), `a "${type}" frame`, timeoutMs);
    return found as Promise<FrameOf<T>>;
  }

  // Sends a chat message and waits for the server's ack (or error).
  async say(roomId: string, text: string, extra: { sentAt?: string } = {}): Promise<FrameOf<'ack'> | FrameOf<'error'>> {
    const ref = `r${++this.refs}`;
    this.send({ type: 'message', roomId, text, ref, ...extra });
    const reply = await this.waitFor((f) => (f.type === 'ack' || f.type === 'error') && f.ref === ref, `a reply to ${ref}`);
    return reply as FrameOf<'ack'> | FrameOf<'error'>;
  }

  private waitFor(match: (f: ServerFrame) => boolean, what: string, timeoutMs = 2000): Promise<ServerFrame> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const index = this.frames.findIndex((f, i) => !this.consumed.has(i) && match(f));
        if (index === -1) return false;
        this.consumed.add(index);
        cleanup();
        resolve(this.frames[index]);
        return true;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timed out waiting for ${what}; got ${JSON.stringify(this.frames.map((f) => f.type))}`));
      }, timeoutMs);
      const wake = () => {
        check();
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== wake);
      };
      if (!check()) this.waiters.push(wake);
    });
  }

  close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

export interface TestServerOptions {
  config?: Partial<Config>;
  logger?: Logger;
}

// Starts the real HTTP + WebSocket server on an ephemeral port with a small
// fixture data set. Stopped automatically after each test.
export async function startServer(opts: TestServerOptions = {}) {
  const store = new MemoryStore();
  const clock = new FakeClock(T0);
  const config: Config = { ...defaultConfig, ...opts.config };
  const app = createChatServer({ store, clock, ids: sequentialIds(), logger: opts.logger ?? silentLogger, config });

  for (const name of ['alice', 'bob', 'carol', 'dave']) {
    await store.saveUser({ id: `usr_${name}`, username: name, displayName: name[0].toUpperCase() + name.slice(1) });
  }
  const createdAt = T0.toISOString();
  await store.saveRoom({ id: 'general', name: 'general', topic: 'Everything', createdAt });
  await store.saveRoom({ id: 'random', name: 'random', topic: 'Off topic', createdAt });
  await store.saveRoom({ id: 'secret', name: 'secret', topic: 'Invite only, in theory', createdAt });
  for (const user of ['usr_alice', 'usr_bob', 'usr_carol']) await store.addMember('general', user);
  for (const user of ['usr_alice', 'usr_bob']) await store.addMember('random', user);

  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const clients: TestClient[] = [];

  running.push(async () => {
    await Promise.all(clients.map((c) => c.close()));
    await app.close();
  });

  async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }

  async function login(username: string): Promise<string> {
    const res = await api('POST', '/auth/login', { body: { username } });
    return res.body.token;
  }

  // Logs in (if given a username) and opens a socket, resolving once the
  // server has sent "ready".
  async function connect(usernameOrToken: string, { asToken = false } = {}): Promise<TestClient> {
    const token = asToken ? usernameOrToken : await login(usernameOrToken);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`);
    const client = new TestClient(ws);
    clients.push(client);
    await client.next('ready');
    return client;
  }

  return { app, services: app.services, store, clock, config, port, baseUrl, api, login, connect };
}

export async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 5));
  }
}
