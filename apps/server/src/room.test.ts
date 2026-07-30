import { beforeEach, describe, expect, test, vi } from "vitest";
import { Room, PEEK_SECONDS, TURN_SECONDS, AFK_TIMEOUTS } from "./room.js";

const fullOf = (room: Room, count: number) =>
  Array.from({ length: count }, (_, i) => room.join(`p${i}`).playerId);

describe("joining a room", () => {
  test("has a short shareable code", () => {
    expect(new Room("seed").code).toMatch(/^[A-Z]{4}$/);
  });

  test("makes the first player the host", () => {
    const room = new Room("seed");
    const { playerId } = room.join("Jakob");

    expect(room.view().seats).toEqual([
      { id: playerId, nickname: "Jakob", connected: true, isHost: true },
    ]);
  });

  test("issues a reconnect token to each player", () => {
    const room = new Room("seed");

    expect(room.join("Jakob").token).toEqual(expect.any(String));
  });

  test("seats up to five players", () => {
    const room = new Room("seed");

    expect(fullOf(room, 5)).toHaveLength(5);
  });

  test("turns away a sixth player", () => {
    const room = new Room("seed");
    fullOf(room, 5);

    expect(() => room.join("late")).toThrow(/full/i);
  });

  test("turns away players once the game has started", () => {
    const room = new Room("seed");
    fullOf(room, 2);
    room.start();

    expect(() => room.join("late")).toThrow(/started/i);
  });

  test("trims an over-long nickname", () => {
    const room = new Room("seed");
    const { playerId } = room.join("x".repeat(50));

    expect(
      room.view().seats.find((seat) => seat.id === playerId)!.nickname.length,
    ).toBeLessThanOrEqual(16);
  });

  test("rejects a blank nickname", () => {
    expect(() => new Room("seed").join("   ")).toThrow(/nickname/i);
  });
});

describe("starting a game", () => {
  test("needs at least two players", () => {
    const room = new Room("seed");
    room.join("solo");

    expect(() => room.start()).toThrow(/at least 2 players/i);
  });

  test("deals into the peek phase", () => {
    const room = new Room("seed");
    const [first] = fullOf(room, 3);
    room.start();

    expect(room.viewFor(first!).phase).toBe("peeking");
  });

  test("cannot be started twice", () => {
    const room = new Room("seed");
    fullOf(room, 2);
    room.start();

    expect(() => room.start()).toThrow(/already/i);
  });
});

describe("validating moves", () => {
  test("refuses an action from a player whose turn it is not", () => {
    const room = new Room("seed");
    const [a, b] = fullOf(room, 2);
    room.start();
    room.act(a!, { type: "ready" });
    room.act(b!, { type: "ready" });

    const outOfTurn = room.viewFor(a!).currentPlayerId === a! ? b! : a!;

    expect(() => room.act(outOfTurn, { type: "draw" })).toThrow(/turn/i);
  });

  test("leaves the game untouched when a move is refused", () => {
    const room = new Room("seed");
    const [a, b] = fullOf(room, 2);
    room.start();
    room.act(a!, { type: "ready" });
    room.act(b!, { type: "ready" });

    const before = room.viewFor(a!);
    const outOfTurn = before.currentPlayerId === a! ? b! : a!;
    expect(() => room.act(outOfTurn, { type: "draw" })).toThrow();

    expect(room.viewFor(a!)).toEqual(before);
  });
});

describe("the clock", () => {
  beforeEach(() => vi.useFakeTimers());

  const started = () => {
    const room = new Room("seed");
    const ids = fullOf(room, 2);
    room.start();
    return { room, ids };
  };

  const intoPlay = () => {
    const { room, ids } = started();
    for (const id of ids) room.act(id, { type: "ready" });
    return { room, ids };
  };

  test("gives everyone a shared window to peek", () => {
    const { room, ids } = started();

    expect(room.timer()).toEqual({
      kind: "peek",
      endsAt: expect.any(Number),
      playerId: null,
    });
    expect(room.viewFor(ids[0]!).phase).toBe("peeking");
  });

  test("starts play when the peek window runs out", () => {
    const { room, ids } = started();

    vi.advanceTimersByTime(PEEK_SECONDS * 1000 + 10);

    expect(room.viewFor(ids[0]!).phase).toBe("playing");
  });

  test("runs a per-turn countdown once play starts", () => {
    const { room } = intoPlay();

    expect(room.timer()).toEqual({
      kind: "turn",
      endsAt: expect.any(Number),
      playerId: expect.any(String),
    });
  });

  test("draws and discards for a player who runs out of time", () => {
    const { room, ids } = intoPlay();
    const before = room.viewFor(ids[0]!);

    vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10);
    const after = room.viewFor(ids[0]!);

    expect(after.currentPlayerId).not.toBe(before.currentPlayerId);
    expect(after.discardCount).toBe(before.discardCount + 1);
    expect(after.drawPileCount).toBe(before.drawPileCount - 1);
  });

  test("never damages the hand of a player who times out", () => {
    const { room, ids } = intoPlay();
    const before = room.viewFor(ids[0]!).players;

    vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10);

    expect(room.viewFor(ids[0]!).players.map((p) => p.slots)).toEqual(
      before.map((p) => p.slots),
    );
  });

  test("flags a player as away after repeated timeouts", () => {
    const { room, ids } = intoPlay();

    for (let i = 0; i < AFK_TIMEOUTS * 2; i++) {
      vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10);
    }

    expect(room.isAway(ids[0]!)).toBe(true);
  });

  test("clears the away flag when the player moves again", () => {
    const { room, ids } = intoPlay();
    for (let i = 0; i < AFK_TIMEOUTS * 2; i++) {
      vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10);
    }

    const active = room.viewFor(ids[0]!).currentPlayerId!;
    room.act(active, { type: "draw" });
    room.act(active, { type: "discard_drawn" });

    expect(room.isAway(active)).toBe(false);
  });
});

describe("reconnecting", () => {
  test("lets a dropped player back in with their token", () => {
    const room = new Room("seed");
    const { playerId, token } = room.join("Jakob");
    room.disconnect(playerId);

    expect(room.reconnect(token)).toBe(playerId);
  });

  test("marks a dropped player as disconnected to everyone else", () => {
    const room = new Room("seed");
    const { playerId } = room.join("Jakob");
    room.disconnect(playerId);

    expect(room.view().seats[0]!.connected).toBe(false);
  });

  test("marks them connected again on return", () => {
    const room = new Room("seed");
    const { playerId, token } = room.join("Jakob");
    room.disconnect(playerId);
    room.reconnect(token);

    expect(room.view().seats[0]!.connected).toBe(true);
  });

  test("refuses an unknown token", () => {
    expect(() => new Room("seed").reconnect("nope")).toThrow(/token/i);
  });

  test("keeps a disconnected player in the game rather than removing them", () => {
    const room = new Room("seed");
    const [a] = fullOf(room, 2);
    room.start();
    room.disconnect(a!);

    expect(room.viewFor(a!).players).toHaveLength(2);
  });
});

describe("bugs found in play", () => {
  beforeEach(() => vi.useFakeTimers());

  const intoPlay = () => {
    const room = new Room("seed");
    const ids = fullOf(room, 2);
    room.start();
    for (const id of ids) room.act(id, { type: "ready" });
    return { room, ids, active: room.viewFor(ids[0]!).currentPlayerId! };
  };

  test("a timeout while holding a drawn card discards it rather than crashing", () => {
    const { room, active } = intoPlay();
    room.act(active, { type: "draw" });
    const before = room.viewFor(active);

    expect(() =>
      vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10),
    ).not.toThrow();

    const after = room.viewFor(active);
    expect(after.currentPlayerId).not.toBe(active);
    expect(after.heldCard).toBeNull();
    expect(after.discardCount).toBe(before.discardCount + 1);
  });

  test("tells everyone when the peek window closes on its own", () => {
    const room = new Room("seed");
    fullOf(room, 2);
    let notified = 0;
    room.onChange(() => notified++);
    room.start();

    vi.advanceTimersByTime(PEEK_SECONDS * 1000 + 10);

    expect(notified).toBeGreaterThan(0);
  });

  test("the turn clock belongs to the turn, not to each action in it", () => {
    const { room, active } = intoPlay();
    const deadline = room.timer()!.endsAt;

    vi.advanceTimersByTime(5000);
    room.act(active, { type: "draw" });

    expect(room.timer()!.endsAt).toBe(deadline);
  });

  test("the clock restarts when the turn passes to someone else", () => {
    const { room, active } = intoPlay();
    const deadline = room.timer()!.endsAt;

    vi.advanceTimersByTime(5000);
    room.act(active, { type: "draw" });
    room.act(active, { type: "discard_drawn" });

    expect(room.timer()!.endsAt).toBeGreaterThan(deadline);
    expect(room.timer()!.playerId).not.toBe(active);
  });
});

describe("a turn held open for a look", () => {
  beforeEach(() => vi.useFakeTimers());

  /** Play on until someone is holding a choice card, then use its power. */
  const intoResolving = () => {
    const room = new Room("resolve");
    const ids = fullOf(room, 2);
    room.start();
    for (const id of ids) room.act(id, { type: "ready" });

    for (let turn = 0; turn < 40; turn++) {
      const active = room.viewFor(ids[0]!).currentPlayerId!;
      room.act(active, { type: "draw" });
      const held = room.viewFor(active).heldCard!;

      if (held === 7 || held === 8) {
        room.act(active, {
          type: "use_power",
          target: { kind: "peek", slot: 0 },
        });
        return { room, active };
      }
      room.act(active, { type: "discard_drawn" });
    }
    throw new Error("never drew a Peek card");
  };

  test("stays with the player until they are done", () => {
    const { room, active } = intoResolving();

    expect(room.viewFor(active).currentPlayerId).toBe(active);
    expect(room.viewFor(active).turnStage).toBe("resolving");
  });

  test("ends on its own when the clock runs out, without crashing", () => {
    const { room, active } = intoResolving();

    expect(() =>
      vi.advanceTimersByTime(TURN_SECONDS * 1000 + 10),
    ).not.toThrow();

    expect(room.viewFor(active).currentPlayerId).not.toBe(active);
  });
});
