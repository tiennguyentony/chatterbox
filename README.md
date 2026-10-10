# Chatterbox

A small team chat server: rooms, live messages, history and unread counts.

Users log in, join rooms, and chat in real time over a WebSocket. Message
history is available over REST with pagination, so clients can scroll back
and catch up after being offline. A minimal web client is included for trying
it out.

## Features

- Rooms you can list, join and leave
- Live messages over WebSocket, with acks so clients know a message was stored
- Message history with cursor pagination (newest first)
- Unread count per room, pushed live and available over REST
- Typing indicators (throttled, not stored)
- Rate limiting: 10 messages per 10 seconds per user
- Messages up to 2,000 characters
- Socket.IO clients supported too, including the long-polling fallback for
  networks that block WebSockets (`src/legacy/socketioAdapter.ts`)
- A tiny web client in `public/`

## Tech stack

- Node.js 24 + TypeScript
- [Socket.IO](https://socket.io) for real-time messaging, with the Redis
  adapter so rooms work across instances (Redis pub/sub)
- Zod for validating requests and frames
- Vitest for tests

## Getting started

Requirements: Node 24 (see `.nvmrc`) and Redis running locally.

```bash
npm install
npm run dev        # http://localhost:3000, demo data loaded on start
npm test
npm run typecheck
```

Open http://localhost:3000 in two browser windows (one private) and log in as
two different users to see messages, typing indicators and unread badges.

| Variable    | Default                  | Purpose                          |
|-------------|--------------------------|----------------------------------|
| `PORT`      | `3000`                   | HTTP and WebSocket port          |
| `HOST`      | `127.0.0.1`              | Interface to listen on           |
| `REDIS_URL` | `redis://localhost:6379` | Redis for pub/sub between nodes  |

## Demo users

Login is username-only for the demo (no passwords): `alice`, `bob`, `carol`,
`dave`. Rooms: `#general` (everyone), `#random` (alice, bob, carol), `#help`
(bob, dave).

## REST API

Send the token as `Authorization: Bearer <token>`. Errors look like
`{ "error": { "code": "NOT_MEMBER", "message": "..." } }`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | `{ "username" }` → `{ token, user }` |
| `GET` | `/me` | the logged-in user |
| `GET` | `/rooms` | every room with `member`, `memberCount`, `unread` |
| `POST` | `/rooms/:id/join` | idempotent |
| `POST` | `/rooms/:id/leave` | resets your unread count |
| `POST` | `/rooms/:id/read` | mark the room as read |
| `GET` | `/rooms/:id/messages` | members only; `limit` (max 100), `before` |

History responses look like `{ "items": [...], "nextCursor": "..." }`, newest
message first. Pass `nextCursor` back as `before` to get the previous page;
it is `null` on the last page.

```bash
curl -X POST localhost:3000/auth/login -H 'content-type: application/json' -d '{"username":"alice"}'
curl localhost:3000/rooms/general/messages?limit=5 -H 'authorization: Bearer <token>'
```

## WebSocket protocol

Connect to `ws://localhost:3000/ws?token=<token>` (or send the
`Authorization` header if your client can). Every frame is a JSON object with
a `type`.

Client → server:

| `type` | Fields | |
|---|---|---|
| `join` | `roomId` | server replies `joined` |
| `leave` | `roomId` | server replies `left` |
| `message` | `roomId`, `text`, optional `sentAt` (ISO time), optional `ref` | server replies `ack` with `ref` and `messageId` |
| `typing` | `roomId` | at most one every 2 s per room is forwarded |
| `read` | `roomId` | same as `POST /rooms/:id/read` |

Server → client: `ready` (after connecting: your user and room ids),
`message`, `ack`, `joined`, `left`, `member` (someone joined or left a room
you're in), `typing`, `unread` (`roomId`, `count`), and `error` (`code`,
`message`, and the `ref` of the frame that caused it, if any).

The server pings every 30 s and drops sockets that don't answer. Clients
should reconnect with backoff and reload history after reconnecting.

## Project layout

```
src/
  app.ts            composition root (createChatServer)
  server.ts         starts the server with demo data
  http/             tiny router, REST routes, static files
  ws/               protocol, hub (rooms → sockets), per-connection handling, rate limit
  services/         auth, chat (rooms, messages, unread), event bus
  store/            Store interface and the in-memory implementation
  domain/           types
  lib/              clock, ids, errors, logger
public/             demo web client
docs/adr/           architecture decision records
tests/              unit + integration tests (real WebSocket clients)
```

## Docs

Design decisions are recorded in [`docs/adr`](docs/adr).
