# ADR-001: Plain WebSockets (`ws`) in one process, no Socket.IO or Redis

**Status:** Accepted (replaces the original Socket.IO + Redis setup)

## Context

The first version used Socket.IO with the Redis adapter so several server
instances could share rooms through Redis pub/sub. In practice:

- every browser we support has native WebSocket, so Socket.IO's long-polling
  fallback was never used;
- Socket.IO's protocol meant our only client had to bundle the Socket.IO
  client library, and any other client (bots, the CLI) needed it too;
- we run a single instance, so Redis did nothing except make
  `npm install && npm test` fail for anyone without Redis running;
- tests were slow and flaky because they shared one Redis.

## Decision

- Use the [`ws`](https://github.com/websockets/ws) library directly, attached
  to a plain `node:http` server (`src/app.ts`). The socket lives at `/ws`.
- Frames are JSON objects with a `type` field. Client frames are validated with
  zod (`src/ws/protocol.ts`); invalid frames get an `error` frame back, the
  socket stays open.
- One process. Fan-out happens in memory: services emit events on
  `ChatEvents` (`src/services/events.ts`) and the `Hub` (`src/ws/hub.ts`)
  delivers them to the sockets subscribed to that room.
- `REDIS_URL` and the Socket.IO adapter are no longer used. Nothing imports
  the old adapter code.

## Consequences

- `npm install && npm test` works with nothing else installed.
- Clients speak a small documented JSON protocol (see the README).
- One instance only. Running two would split rooms between them. If we ever
  need that, the place to add a pub/sub layer is between `ChatEvents` and
  the `Hub`; services don't need to change.
