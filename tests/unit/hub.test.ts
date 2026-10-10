import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { silentLogger } from '../../src/lib/logger';
import { ChatEvents } from '../../src/services/events';
import { type Connection, Hub } from '../../src/ws/hub';

class FakeSocket {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  closed: { code: number; reason: string } | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  close(code: number, reason: string) {
    this.closed = { code, reason };
    this.readyState = WebSocket.CLOSING;
  }
}

function setup() {
  const bus = new ChatEvents();
  const hub = new Hub({ bus, logger: silentLogger, maxBufferedBytes: 1000 });
  const connect = (userId: string, rooms: string[]) => {
    const ws = new FakeSocket();
    const conn = { id: `conn_${userId}`, user: { id: userId, username: userId, displayName: userId }, ws } as unknown as Connection;
    hub.add(conn, rooms);
    return ws;
  };
  return { bus, hub, connect };
}

const message = (roomId: string) => ({
  id: 'msg_1',
  roomId,
  userId: 'usr_alice',
  author: 'Alice',
  text: 'hi',
  sentAt: '2027-03-01T09:00:00.000Z',
});

describe('Hub', () => {
  it('broadcasts room messages to subscribed sockets only', () => {
    const { bus, connect } = setup();
    const inRoom = connect('usr_bob', ['general']);
    const elsewhere = connect('usr_carol', ['random']);
    bus.emit('message', message('general'));
    expect(inRoom.sent).toHaveLength(1);
    expect(elsewhere.sent).toHaveLength(0);
  });

  it('disconnects a client that is not reading instead of buffering forever', () => {
    const { bus, connect } = setup();
    const slow = connect('usr_bob', ['general']);
    const fast = connect('usr_carol', ['general']);
    slow.bufferedAmount = 5000;

    bus.emit('message', message('general'));

    expect(slow.sent).toHaveLength(0);
    expect(slow.closed).toEqual({ code: 4008, reason: 'Too slow' });
    expect(fast.sent).toHaveLength(1);
  });

  it('skips sockets that are already closing', () => {
    const { bus, connect } = setup();
    const ws = connect('usr_bob', ['general']);
    ws.readyState = WebSocket.CLOSING;
    bus.emit('message', message('general'));
    expect(ws.sent).toHaveLength(0);
  });
});
