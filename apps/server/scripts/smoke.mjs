// Drives three real WebSocket clients through a full match against the running
// server, and asserts that no client is ever sent another player's card values.
import { WebSocket } from "ws";

const URL = "ws://localhost:8787";
const log = (...args) => console.log(...args);

let leaks = 0;
let rounds = 0;
/** Events each bot received about actions somebody ELSE took. */
const seenFromOthers = {};

class Bot {
  constructor(name) {
    this.name = name;
    this.socket = new WebSocket(URL);
    this.id = null;
    this.code = null;
    this.view = null;
    this.ready = new Promise((resolve) => (this.onOpen = resolve));

    this.socket.on("open", () => this.onOpen());
    this.socket.on("message", (raw) => this.handle(JSON.parse(String(raw))));
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  handle(message) {
    if (message.type === "welcome") {
      this.id = message.playerId;
      this.code = message.roomCode;
    }

    if (message.type === "error") {
      log(`  ! ${this.name}: ${message.message}`);
    }

    if (message.type === "events") {
      for (const event of message.events) {
        const actor = event.playerId;
        if (actor && actor !== this.id) {
          seenFromOthers[event.type] = (seenFromOthers[event.type] ?? 0) + 1;
        }
      }
    }

    if (message.type === "state") {
      this.view = message.view;
      this.audit(message.view);
      setTimeout(() => this.play(), 5);
    }
  }

  /** Nothing on the wire may carry a card value this player has not earned. */
  audit(view) {
    for (const player of view.players) {
      for (const slot of player.slots) {
        if (typeof slot !== "boolean") {
          leaks++;
          log(`  !! LEAK: ${this.name} was sent a card value for ${player.id}`);
        }
      }
    }
    if (view.phase !== "roundOver" && view.phase !== "gameOver") {
      if (view.revealedHands !== null) {
        leaks++;
        log(`  !! LEAK: ${this.name} got revealed hands mid-round`);
      }
    }
    if (view.currentPlayerId !== this.id && view.heldCard !== null) {
      leaks++;
      log(`  !! LEAK: ${this.name} was sent someone else's drawn card`);
    }
  }

  play() {
    const view = this.view;
    if (!view) return;

    if (view.phase === "peeking") {
      const me = view.players.find((p) => p.id === this.id);
      if (me.peeksUsed.length < 2) {
        this.send({
          type: "action",
          action: { type: "peek_card", slot: me.peeksUsed.length },
        });
      } else if (!me.ready) {
        this.send({ type: "action", action: { type: "ready" } });
      }
      return;
    }

    if (view.phase === "roundOver") {
      if (view.players[0].id === this.id) {
        rounds++;
        log(
          `  round ${rounds} done — totals ${view.players
            .map((p) => `${p.totalScore}`)
            .join(" / ")}`,
        );
        this.send({ type: "next_round" });
      }
      return;
    }

    if (view.phase === "gameOver") return;
    if (view.currentPlayerId !== this.id) return;

    // A turn held open for a look accepts nothing but finishing it.
    if (view.turnStage === "resolving") {
      this.send({ type: "action", action: { type: "end_turn" } });
      return;
    }

    if (view.heldCard === null) {
      // Occasionally call CABO so the round actually ends.
      if (Math.random() < 0.12 && view.caboCalledBy === null) {
        this.send({ type: "action", action: { type: "call_cabo" } });
      } else {
        this.send({ type: "action", action: { type: "draw" } });
      }
      return;
    }

    const me = view.players.find((p) => p.id === this.id);
    const filled = me.slots.flatMap((f, i) => (f ? [i] : []));
    const held = view.heldCard;
    const power =
      held === 7 || held === 8
        ? "peek"
        : held === 9 || held === 10
          ? "spy"
          : held === 11 || held === 12
            ? "swap"
            : null;
    const other = view.players.find((p) => p.id !== this.id);

    // Exercise the paths that hold a turn open: powers and match attempts.
    if (power && view.heldFrom === "draw" && Math.random() < 0.7) {
      const target =
        power === "peek"
          ? { kind: "peek", slot: filled[0] }
          : power === "spy"
            ? { kind: "spy", playerId: other.id, slot: 0 }
            : {
                kind: "swap",
                ownSlot: filled[0],
                playerId: other.id,
                theirSlot: 0,
              };
      this.send({ type: "action", action: { type: "use_power", target } });
      return;
    }

    // Sequential match: turn cards over one at a time, then trade or bust.
    const attempt = view.matchAttempt;
    if (attempt) {
      const untouched = filled.filter((s) => !attempt.revealed.includes(s));
      if (attempt.revealed.length < 2 && untouched.length > 0) {
        this.send({
          type: "action",
          action: { type: "reveal_for_match", slot: untouched[0] },
        });
      } else {
        this.send({
          type: "action",
          action: { type: "commit_match", into: attempt.revealed[0] },
        });
      }
      return;
    }

    if (filled.length >= 2 && Math.random() < 0.2) {
      this.send({
        type: "action",
        action: { type: "reveal_for_match", slot: filled[0] },
      });
      return;
    }

    if (view.heldFrom === "discard" || (Math.random() < 0.5 && filled.length > 0)) {
      this.send({
        type: "action",
        action: {
          type: "place_drawn",
          target: { kind: "slot", slot: filled[0] },
        },
      });
    } else {
      this.send({ type: "action", action: { type: "discard_drawn" } });
    }
  }
}

const a = new Bot("alice");
const b = new Bot("bob");
const c = new Bot("carol");

await Promise.all([a.ready, b.ready, c.ready]);

a.send({ type: "create_room", nickname: "alice" });
await new Promise((r) => setTimeout(r, 200));

log(`room ${a.code}`);
b.send({ type: "join_room", code: a.code, nickname: "bob" });
c.send({ type: "join_room", code: a.code, nickname: "carol" });
await new Promise((r) => setTimeout(r, 200));

a.send({ type: "start_game" });

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 250));
  if (a.view?.phase === "gameOver") break;
}

const final = a.view;
log("");
log(`phase:  ${final?.phase}`);
log(`rounds: ${rounds}`);
log(`totals: ${final?.players.map((p) => `${p.id.slice(0, 4)}=${p.totalScore}`).join("  ")}`);
log(`leaks:  ${leaks}`);
log("");
log("what players saw others do:");
for (const [type, count] of Object.entries(seenFromOthers).sort()) {
  log(`  ${type.padEnd(18)} ${count}`);
}

// The whole point of the table: you must be told what other people did.
const mustBeVisible = ["swapped", "placed", "peeked"];
const invisible = mustBeVisible.filter((type) => !seenFromOthers[type]);
if (invisible.length > 0) {
  log(`  !! never reached other players: ${invisible.join(", ")}`);
}

for (const bot of [a, b, c]) bot.socket.close();

const ok = final?.phase === "gameOver" && leaks === 0 && invisible.length === 0;
log(ok ? "\nPASS — full match played, no card values leaked" : "\nFAIL");
process.exit(ok ? 0 : 1);
