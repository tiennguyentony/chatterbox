# ADR-003: In-memory store behind an async interface

**Status:** Accepted

## Context

Chat data for our team is small (a few rooms, tens of thousands of messages)
and the demo/dev setup must run without installing a database. We still
expect to move to a real database once message search is on the roadmap.

## Decision

- All data access goes through the `Store` interface (`src/store/store.ts`).
- The interface is **async** (every method returns a Promise) even though the
  only implementation, `MemoryStore`, keeps everything in `Map`s. A SQLite or
  Postgres implementation can then be dropped in without changing callers.
- Tests create a fresh `MemoryStore` per test. The dev server seeds demo data
  on every start (`src/seed.ts`).
- Each `Store` method is atomic on its own. Nothing is atomic **across** two
  calls: other work can run at every `await`, exactly as it would with a
  real database. Code that reads a value and writes it back must account for
  that.

## Consequences

- All data is lost on restart. Acceptable for now.
- History queries load a room's messages into memory and sort them. Fine at
  our size; a database implementation should push that into a query.
- Moving to a database means writing one new `Store` class.
