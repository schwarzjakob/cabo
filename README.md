# CABO

A faithful web implementation of the card game CABO. Private rooms now; a
ranked ladder later.

**[`SPEC.md`](./SPEC.md) is canonical.** The rules there are transcribed from
the official printed rules card; where code and spec disagree, the spec wins.

## Running it

```bash
pnpm install
pnpm dev          # server on :8787, client on :5173
```

Open <http://localhost:5173> in two to five tabs. One tab creates a room, the
rest join with the four-letter code.

```bash
pnpm test         # 208 tests
pnpm typecheck    # server + client
pnpm --filter @cabo/server smoke   # plays a full match over real sockets
```

## Layout

| Path | What it is |
|------|-----------|
| `packages/engine` | The rules. Pure and I/O-free — no sockets, no clock, no `Math.random`. Built test-first. |
| `packages/protocol` | The wire format shared by client and server. |
| `apps/server` | Fastify + `ws`. In-memory rooms, turn timers, move validation. |
| `apps/client` | React + Vite, mobile-first. |

## The two things worth knowing

**The server is authoritative and the client is a renderer.** CABO is a
hidden-information game, so card values never reach a client that has not
earned them. `viewFor()` builds a per-player view carrying no card values at
all, and `redactEvent()` strips values per recipient. Randomised whole-game
tests assert that nothing leaks, and were verified to fail when redaction is
deliberately broken.

**Memory is the game.** Peeked cards are not kept visible. You press and hold a
card to look at it and release to hide it, with your clock running — and a look
expires with the entitlement that earned it, so the opening peeks die when play
begins and a power's look dies when the turn passes. Everyone can see *which*
slot you looked at, never its value, exactly as at a real table.

## Status

M1 (playable on localhost) is done. See `SPEC.md` for M2–M5 and the backlog.
