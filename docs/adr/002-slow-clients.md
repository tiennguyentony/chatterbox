# ADR-002: Disconnect slow clients; history is the source of truth

**Status:** Accepted

## Context

`ws.send()` never blocks. If a client stops reading (a phone on a bad
connection, a laptop going to sleep, a buggy bot), everything we send to it
piles up in that socket's buffer in our process. One busy room and a few
stalled clients were enough to push memory up by hundreds of megabytes during
an all-hands, and the heartbeat alone (30 s) is too slow to catch it.

We considered:

1. buffer without limit (what we had): unbounded memory;
2. drop individual frames for slow clients: the client silently has gaps
   and doesn't know it;
3. disconnect the client once its buffer passes a limit, and let it catch up.

## Decision

Option 3. Before every send, the `Hub` checks `ws.bufferedAmount`. Above
`maxBufferedBytes` (1 MiB) it closes the socket with code **4008 "Too slow"**
and logs a warning.

Live frames are best effort. **Message history over REST is the source of
truth**: every message is stored before it is broadcast. The web client
reconnects with backoff and reloads rooms and history after every reconnect.

## Consequences

- Memory per socket is bounded.
- A client on a bad network may see "reconnecting…" more often. It does not
  lose messages: they are in `GET /rooms/:id/messages`.
- Typing indicators and member events sent while a client was disconnected
  are lost. That is fine; they are ephemeral.
- Any new client must handle reconnects by re-fetching history.
