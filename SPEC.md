# CABO — Web Multiplayer

A faithful digital implementation of the card game CABO, playable in the browser:
private rooms for friends, and a ranked ladder for signed-in players.

This document is the canonical specification. The rules section is transcribed
from the official printed rules card and is authoritative — where implementation
and this document disagree, this document wins.

---

## 1. Rules (canonical, official)

### Deck

52 cards, numbers only, no suits and no face pictures:

| Card | Count |
|------|-------|
| 1–12 | 4 each (48) |
| 0    | 2 |
| 13   | 2 |

A card's point value is its number. `0` is worth nothing; `13` is the worst card
to hold and carries no power.

### Object

Collect the lowest cards in each hand to accumulate the fewest points by the end
of the game.

### Setup

- Deal 4 cards to each player, face down in a fixed row.
- Remaining cards form the draw pile; one card is turned face up to start the
  discard pile.
- Each player may look at **2 of their own cards**, once, after each deal.
- **Card positions never change during a round.** A card replaced in slot 2 stays
  in slot 2.
- Round 1: first player is chosen arbitrarily. Later rounds: the winner of the
  previous round goes first (if tied, the tied player with the lowest total
  score begins).

### Turn — exactly one of three actions

Turns proceed clockwise.

1. **Take the top card of the discard pile** and use it to replace one of your
   own cards, or a match set (see Matching). No power is ever granted this way.
2. **Take the top card of the draw pile**, look at it, then:
   - (a) replace one of your own cards, or a match set; or
   - (b) discard it; or
   - (c) if it is a choice card, carry out its action and then discard it.
3. **Call Cabo** — no card is drawn. Every other player then takes one more
   turn, and the round ends.

### Choice cards

| Cards | Name | Effect |
|-------|------|--------|
| 7, 8   | **Peek** | Look at one of your own cards |
| 9, 10  | **Spy**  | Look at one of another player's cards |
| 11, 12 | **Swap** | Swap one of your cards with another player's — **without looking** |

Constraints:

- A choice card's action may only be used when the card was taken **from the draw
  pile** and is then discarded.
- The action may **not** be used on a card taken from the discard pile, nor on a
  card discarded out of a player's hand.
- Using the action is **optional** — a choice card may simply be kept for its
  points.

### Matching cards

On your turn, 2-, 3-, or 4-of-a-kind in your own hand may all be traded for a
**single** card taken from the discard or draw pile. You then continue the round
with only 3, 2, or even 1 card.

If a match is attempted and the cards do **not** match:

- The attempted cards are shown to everyone at the table,
- they are put back in their original positions,
- the attempted replacement card is discarded,
- and **the turn is lost**.

### Draw pile exhaustion

Shuffle the discard pile to form a new draw pile, setting its top card aside face
up as the new discard pile.

### Scoring a round

After every player has taken their final turn, all cards are revealed and each
hand is totalled.

- The player with the **lowest** hand wins the round and scores **0**.
- Every other player scores the total of the cards in their hand.
- If the player who called Cabo does **not** have the lowest score, they take
  **+5 penalty points** on top of their hand total.
- **Tie:** the player who called Cabo wins. If neither tied player called Cabo,
  all tied players receive 0.

### Special rules

- **Kamikaze** — end a round holding two 12s and both 13s: every other player
  receives **50 points**, and you receive **0**.
- **Exactly 100** — if a player's cumulative score is exactly 100, it drops to
  **50**.
- **Ending the game** — once a player **exceeds** 100 points, the game ends and
  the player with the lowest total wins.

### Players

**2–5 players** per game, per the printed rules.

---

## 2. Product decisions

### Modes

| | Private rooms | Ranked |
|---|---|---|
| Entry | Room code / link | Matchmaking queue |
| Identity | Guest nickname **or** signed-in account | Account required |
| Affects rating | **Never** | Yes |
| Stats recorded | Casual stats, signed-in players only | Full |

Private games never affect rating — chosen opponents make rating farming
trivially easy and impossible to police.

### Memory is the game

Peeked cards are **not** kept visible. A player **taps and holds** a card to look
at it and releases to hide it, with the turn clock running the whole time —
looking costs time.

**Opponents always see *which* slot was looked at, never its value.** This mirrors
the physical game, where everyone watches you lift a specific card. Applies to the
opening peek, to Peek, and to Spy (the target sees which of their cards was
inspected).

### Turns are held open for anything you learn

A turn does not end the moment an action resolves. Anything that shows
information — **Peek**, **Spy**, **Swap**, or a **match attempt** — puts the turn
into a `resolving` stage that stays with the acting player until they press
**Done**. An ordinary draw-and-replace or draw-and-discard still passes play on
immediately.

This exists because the physical game has a beat that the first build removed:
you look at the card, you take it in, *then* play moves on. Without it the
client deleted a peeked value in the same frame it arrived, so the player paid a
card for a look they never got.

The turn clock keeps running during `resolving`, and expiry ends the turn
automatically — the beat is for absorbing information, not for stalling.

**Actions are chosen before targets.** You pick Keep / Use power / Discard and
*then* tap a card. Cards are inert until an action is chosen.

**A match reveal is all-at-once and binding.** You select the whole set and
confirm once; the cards then turn face up for everyone. Revealing them one at a
time with the option to stop would hand the player free information whenever
they did not match — and per the printed rules the reveal *is* the penalty.

### Clock

- **60 second per-turn timer**, resetting each turn. Configurable in private
  rooms; fixed for ranked.
- **Opening peek phase: 30 seconds** to view your two cards and press Ready.
- **On timeout:** auto draw-and-discard — draw the top card, discard it face up,
  no power used, hand untouched. Fully legal and information-neutral; never
  worsens the timed-out player's position.
- Three consecutive timeouts flags the player as AFK.
- Chess-style time bank is backlog, not v1.

### Rating (ranked)

- **Pairwise Elo**: a free-for-all match is decomposed into pairwise results by
  finishing order; standard Elo is applied to each pair and the deltas summed.
- Rating attaches to a **full match** (played to 100), not to individual rounds.
- **10 placement matches** before a rank is displayed — Cabo is high-variance.
- The rating module sits behind an interface so it can be swapped for TrueSkill
  or Glicko-2 without touching game code.

### Identity

- Private rooms: guest nickname, no signup.
- Ranked: account required.
- Signed-in players may also play private rooms.
- **Sign-in is email magic link only** (Better Auth + Resend). No passwords, no
  OAuth.
- Guests carry **nothing** over on signup — no stats migration, no identity
  merging.

---

## 3. Architecture

### Constraint: the server is authoritative

Cabo is a hidden-information game. Card values must never reach a client that
hasn't earned the right to see them, or devtools wins the game. Therefore:

- All moves are validated server-side.
- Each client receives a **personalised, redacted view** of game state.
- The client is a renderer, never a source of truth.

### Stack

- **TypeScript throughout.**
- **Rules engine: a pure, I/O-free module** — deck, deal, turn resolution,
  matching, powers, scoring, Kamikaze, game end. No sockets, no clock, no
  randomness it doesn't own. Imported by the server, the tests, and later any
  bot. **Built test-first.**
- **Server:** Node + Fastify + `ws`. Rooms held in memory.
- **Client:** React + Vite SPA. Mobile-first, responsive.
- **Database:** Postgres, added at the accounts milestone.
- **Hosting:** Fly.io or Railway.

Chosen for portability and identical behaviour on localhost and in production.
Because the engine is pure, moving to another transport (e.g. Cloudflare Durable
Objects) later is a swap, not a rewrite.

### Durability

- Rooms live in server memory.
- Each player holds a **reconnect token** in localStorage; reconnecting within a
  grace window restores full state.
- While a player is away, their turns auto draw-and-discard so the game does not
  stall.
- A server restart ends live games in v1. Acceptable for private rooms;
  **must be fixed (persisted games) before ranked ships**, since an abandoned
  ranked match has rating consequences.

### Client structure

Game state and view-model logic are kept **separate from React components**, so a
future native app reuses the brain and rewrites only the pixels.

---

## 4. Design

**Clean and minimal, motion-led.** Large unambiguous numerals, flat cards, clear
slot positions, restrained palette. The styling budget goes into **animation**
rather than decoration: the flip, the draw, the discard, the swap arc, the peek
highlight. Ornamentation competes with the numbers players are trying to
memorise.

**Mobile-first**, designed at ~390px and scaled up to desktop. Native mobile app
is backlog.

---

## 5. Milestones

### M1 — Playable Cabo on localhost
Rules engine (test-first, full coverage of every rule in §1). Fastify + `ws`
server, in-memory rooms, room codes, per-player redacted state, server-side move
validation. React client: lobby, 2–5 player table, tap-and-hold peek, opponent
peek highlights, 60s turn timer, auto draw-and-discard, reconnect token.

**Done when:** three browser tabs on localhost play a full match to 100.

### M2 — Feel
Animation pass (deal, flip, draw, discard, swap arc, peek highlight). Round
summary and score screens. Rules screen. Mobile layout hardening. Edge-case UX.

### M3 — Deployed private rooms
Fly.io or Railway. Real URL, shareable room links, guests only. Basic logging and
uptime monitoring.

### M4 — Accounts
Postgres. Better Auth magic link via Resend. Profiles. Casual stats for signed-in
players.

### M5 — Ranked
Matchmaking queue. Pairwise Elo. Placement matches. Leaderboard. Seasons.
Abandonment handling. Persisted games (the durability upgrade ranked requires).

### Backlog
AI bot · chess clock · deck skins and UI themes as an account setting · native
mobile app · private-room rule variants · spectators · assist mode (persistent
card visibility)
