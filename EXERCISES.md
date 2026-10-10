# Chatterbox exercises

You are joining the Chatterbox team this week. You have never seen this code
before. Use AI tools (Claude, ChatGPT, Copilot, Cursor, anything you like)
the way you would at work.

What we care about is **how** you work with AI, not how fast you finish:

- what context you give the tool,
- whether you check what it tells you before you believe it,
- when you disagree with it,
- and whether you can explain the result in your own words.

Your interviewer will tell you which exercises to do. You probably won't
finish everything. That's expected. Say what you skipped and why.

## Before you start

```bash
git clone https://github.com/tiennguyentony/chatterbox.git
cd chatterbox
npm install
npm test             # should be green
npm run typecheck    # should be clean
npm run dev          # http://localhost:3000, demo data loaded
```

You need Node 24 (`node -v`). Nothing else needs to be installed.

To try the app, open http://localhost:3000 in two browser windows (one of them
private) and log in as two different users, for example `alice` and `bob`.

**Ground rules**

1. Share your screen, including your AI chat window.
2. Keep your AI conversation. At the end, export or copy it into
   `session/ai-transcript.md` (or share a link).
3. For each piece of AI output you use, be ready to say whether you
   **accepted**, **edited** or **rejected** it, and why.
4. You may run anything, add files and change code. Commit to a branch
   named `session/<your-name>`.

---

## Warm-up: explore and explain (10–15 min)

Use AI however you like to understand the codebase. Then write
`session/NOTES.md` answering:

1. In two or three sentences: what does this service do, and how is it built?
2. Alice types a message in `#general` in the web client and presses Enter.
   Trace what happens until Bob sees it and Carol's unread badge for
   `#general` goes up. Name the files and functions, and every reason the
   message could be refused.
3. Where does the data live, and what happens to it when the server restarts?

Then **close the AI window** and walk your interviewer through your notes.

# Part 1: When AI gets it wrong

These tasks are areas where AI tools commonly give confident, plausible and
wrong answers: concurrency in "single-threaded" code, who receives a
broadcast, what the docs claim versus what the code does. Your job is to
catch them and **prove** what's true, with a failing test, a reproduction, or
a pointer to the exact line. "The AI said so" is not proof; neither is "it
looks right".

## 1.1 Support queue (20 min)

Three messages arrived in the team channel this morning:

> **Bob:** I left `#random` yesterday (clicked Leave, it disappeared from my
> rooms) but messages from `#random` keep popping up in my window until I
> reload the page. Kind of awkward, they were planning my birthday in there.

> **Alice:** Dave's replies in `#general` show up *above* the messages he's
> replying to. He says his laptop clock "might be a bit off". Also, when I
> click "Load older messages" after a busy standup, a few messages are just
> missing. Are we losing data?

> **Carol:** I'm on hotel Wi-Fi this week. The chat keeps flipping to
> "reconnecting…" and the server log says `closing slow client`. Did my
> messages get lost? Can we please stop the server from kicking people?

For each one:

1. Is it a bug? Find the root cause (file and function), or explain why the
   behaviour is intended.
2. For each real bug, write a test that **fails now** and would pass once it's
   fixed. Commit the failing test.
3. Fix the one you think matters most, and say why you picked it.

## 1.2 AI bug hunt: the WebSocket layer (15 min)

Ask your AI tool to review `src/ws/` and the upgrade handler in `src/app.ts`
for bugs.

1. Triage every finding in `session/triage.md`: **real**, **not real** or
   **real but not worth fixing now**, each with one sentence of reasoning that
   points at the code.
2. Prove the most serious real finding with a test (or a reproduction you can
   show) that fails now.
3. Which findings did you throw away, and why?

## 1.3 Is the web client safe to ship? (10 min)

Security asked one question before we put Chatterbox in front of the whole
company:

> Can one user run JavaScript in another user's browser, or steal another
> user's session?

Answer it, using AI to help. Look at `public/` and at how the server handles
the token. Back up each "yes" with something you can show (a message you can
send, a log line, a test), and say where the fix belongs.

## 1.4 Do the docs tell the truth? (10 min)

Ask your AI tool to update the README so a new hire can run the project and
understands the architecture.

1. Before you accept it, list every statement in the **current** README and
   in the AI's version that is wrong, and how you checked each one (file,
   command, test).
2. Then fix the README yourself. Keep the parts that are accurate.

## 1.5 Review an AI answer (10 min)

A teammate asked an AI assistant whether unread counts can drift. The answer
is in `review/ai-answer-unread-counts.md`.

1. Go through it claim by claim: true, false, or true-but-irrelevant?
2. Does the suggested test prove what it says it proves? Why or why not?
3. Write a test that settles the question either way. If you find a bug,
   say how you'd fix it (you don't have to).

# Part 2: Build a new feature with AI

Before your first prompt, write `session/context.md`: what you will tell the
AI about this codebase (conventions, invariants, anything it shouldn't trust)
and your **definition of done**. Add a short plan (3–6 steps). Then use it.
Keep commits small. You will be asked how you verified each part, so keep
track of what you ran.

## 2.1 Small feature: edit a message (15 min)

Users can fix typos in their own messages.

- New client frame `{ "type": "edit", "messageId", "text" }`.
- Only the author can edit, and only within **15 minutes** of sending.
  Otherwise the client gets an `error` frame with a clear code.
- The same text rules as new messages apply.
- The stored message keeps its id and position in history, gets the new
  text, and is marked as edited (`editedAt`).
- Everyone in the room sees the edit live (`{ "type": "edited", "message" }`).
- Tests for: happy path, not the author, too late, too long.

## 2.2 Medium feature: read receipts (25 min)

Show who has seen a message.

- When a user reads a room, the client sends
  `{ "type": "read", "roomId", "upTo": "<messageId>" }`. Reading up to a
  message means you've read it and **everything before it**.
- The server remembers, per user and room, the last message they've read.
- `GET /rooms/:id/messages` items include `readBy`: the ids of other members
  who have read that message.
- Members of the room get a live `{ "type": "receipt", "roomId", "userId",
  "upTo" }` frame.
- A user's unread count for the room must agree with their receipt.
- Tests that show the receipt reaches the right people, and only them.

## 2.3 Larger feature: direct messages (40 min, or design-only in 15 min)

Two users can talk privately.

- `POST /dms` with `{ "userId" }` creates (or returns the existing)
  conversation between you and that user.
- DMs use the same message, history, unread and typing machinery as rooms.
- **Privacy invariant:** nobody except the two participants can ever see a
  DM: not in `GET /rooms`, not by joining it, not in history, and not over
  any WebSocket frame (messages, typing, unread, member events).
- `GET /dms` lists your conversations with the other person's name and your
  unread count.
- Tests that would catch a privacy leak.

If you choose design-only: write `session/dm-design.md` with the data model,
the endpoints and frames, how you'd guarantee the invariant, and the tests
you'd write first.

## 2.4 Teach the next AI (10 min)

Write an `AGENTS.md` (or `CLAUDE.md`) at the repo root, so the next
engineer's AI tool doesn't repeat the mistakes you saw today. Keep it under
40 lines. Only include things that are true and useful.

## 2.5 Pull request description (5 min)

Write the PR description for your branch, for a busy senior engineer who has
five minutes:

- what changed,
- how you verified it (exactly what you ran),
- what you did **not** verify,
- which part of the diff they should review most carefully,
- which parts were AI-written.
