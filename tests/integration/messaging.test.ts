import { describe, expect, it } from 'vitest';
import { startServer } from '../helpers';

describe('live messages', () => {
  it('delivers a message to everyone in the room, including the sender', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const bob = await connect('bob');

    const ack = await alice.say('general', '  hello everyone  ');
    expect(ack.type).toBe('ack');

    const atBob = await bob.next('message');
    expect(atBob.message).toMatchObject({ roomId: 'general', userId: 'usr_alice', author: 'Alice', text: 'hello everyone' });
    const atAlice = await alice.next('message');
    expect(atAlice.message.id).toBe(atBob.message.id);
  });

  it('does not deliver to people who are not in the room', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const carol = await connect('carol'); // in general, not in random

    await alice.say('random', 'just between us');
    await alice.say('general', 'hello all');

    // Frames on one socket arrive in order, so once Carol has the #general
    // message she would already have the #random one if it had been sent.
    const received = await carol.next('message');
    expect(received.message.text).toBe('hello all');
    expect(carol.received('message')).toHaveLength(1);
  });

  it('refuses messages to rooms you have not joined', async () => {
    const { connect } = await startServer();
    const carol = await connect('carol');
    const res = await carol.say('random', 'let me in');
    expect(res).toMatchObject({ type: 'error', code: 'NOT_MEMBER' });
  });

  it('starts delivering a room after joining it over the socket', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const carol = await connect('carol');

    carol.send({ type: 'join', roomId: 'random' });
    await carol.next('joined');
    expect((await alice.next('member')).action).toBe('joined');

    await alice.say('random', 'welcome carol');
    expect((await carol.next('message')).message.text).toBe('welcome carol');
  });

  it('rejects frames that are not valid JSON or not a known shape', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    alice.ws.send('not json');
    expect((await alice.next('error')).code).toBe('INVALID_FRAME');
    alice.send({ type: 'shout', roomId: 'general' });
    expect((await alice.next('error')).code).toBe('INVALID_FRAME');
  });

  it('rejects empty messages', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const res = await alice.say('general', '   ');
    expect(res).toMatchObject({ type: 'error', code: 'INVALID_FRAME' });
  });
});

describe('typing indicator', () => {
  it('goes to the other members but not back to the typist', async () => {
    const { connect } = await startServer();
    const alice = await connect('alice');
    const bob = await connect('bob');

    alice.send({ type: 'typing', roomId: 'general' });
    expect(await bob.next('typing')).toMatchObject({ roomId: 'general', userId: 'usr_alice', displayName: 'Alice' });

    await alice.say('general', 'done typing');
    await alice.next('message');
    expect(alice.received('typing')).toHaveLength(0);
  });

  it('is throttled per room', async () => {
    const { connect, clock, config } = await startServer();
    const alice = await connect('alice');
    const bob = await connect('bob');

    alice.send({ type: 'typing', roomId: 'general' });
    alice.send({ type: 'typing', roomId: 'general' });
    await bob.next('typing');
    clock.advance(config.typingThrottleMs);
    alice.send({ type: 'typing', roomId: 'general' });
    await bob.next('typing');

    await alice.say('general', 'flush');
    await bob.next('message');
    expect(bob.received('typing')).toHaveLength(2);
  });
});

describe('rate limiting', () => {
  it('rejects messages beyond the limit and recovers after the window', async () => {
    const { connect, clock } = await startServer({ config: { messageRateLimit: { max: 3, windowMs: 10_000 } } });
    const alice = await connect('alice');

    for (let i = 0; i < 3; i++) expect((await alice.say('general', `msg ${i}`)).type).toBe('ack');
    expect(await alice.say('general', 'one too many')).toMatchObject({ type: 'error', code: 'RATE_LIMITED' });

    clock.advance(10_000);
    expect((await alice.say('general', 'back again')).type).toBe('ack');
  });
});

describe('disconnects', () => {
  it('removes the connection from the hub', async () => {
    const { connect, services } = await startServer();
    const alice = await connect('alice');
    expect(services.hub.stats().connections).toBe(1);
    await alice.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(services.hub.stats()).toEqual({ connections: 0, rooms: 0 });
  });
});
