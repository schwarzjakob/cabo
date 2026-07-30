// Regression check for the crash that killed a live game: a player draws a
// card and then goes silent until their turn clock expires. The server used to
// try to draw a second card, throw inside the timer callback, and die.
import { WebSocket } from "ws";

const URL = "ws://localhost:8787";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(name) {
    this.name = name;
    this.socket = new WebSocket(URL);
    this.id = null;
    this.code = null;
    this.view = null;
    this.frozen = false;
    this.ready = new Promise((r) => (this.open = r));
    this.socket.on("open", () => this.open());
    this.socket.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "welcome") {
        this.id = m.playerId;
        this.code = m.roomCode;
      }
      if (m.type === "state") {
        this.view = m.view;
        if (!this.frozen) setTimeout(() => this.play(), 5);
      }
    });
  }

  send(m) {
    this.socket.send(JSON.stringify(m));
  }

  play() {
    const v = this.view;
    if (!v || v.phase !== "peeking") return;
    const me = v.players.find((p) => p.id === this.id);
    if (!me.ready) this.send({ type: "action", action: { type: "ready" } });
  }
}

const a = new Bot("a");
const b = new Bot("b");
await Promise.all([a.ready, b.ready]);

a.send({ type: "create_room", nickname: "a" });
await wait(300);
b.send({ type: "join_room", code: a.code, nickname: "b" });
await wait(300);
a.send({ type: "start_game" });
await wait(1000);

// Whoever is to move draws, then freezes — the exact shape of the crash.
const active = [a, b].find((bot) => bot.view?.currentPlayerId === bot.id);
if (!active) {
  console.log("FAIL — could not reach the playing phase");
  process.exit(1);
}
active.frozen = true;
active.send({ type: "action", action: { type: "draw" } });
await wait(500);

console.log(`${active.name} drew and went silent; waiting out a 60s turn…`);
await wait(64_000);

const health = await fetch("http://localhost:8787/health")
  .then((r) => r.json())
  .catch(() => null);

const other = active === a ? b : a;
const movedOn =
  other.view?.currentPlayerId === other.id && other.view?.someoneIsHolding === false;

console.log(`server alive: ${Boolean(health)}`);
console.log(`turn moved on: ${movedOn}`);

for (const bot of [a, b]) bot.socket.close();

const ok = Boolean(health) && movedOn;
console.log(ok ? "PASS — survived a timeout while holding a card" : "FAIL");
process.exit(ok ? 0 : 1);
