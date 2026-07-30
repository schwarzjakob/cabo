import { describe, expect, test } from "vitest";
import { Room } from "./room.js";
import type { GameEvent } from "@cabo/engine";

/** A two-player room in the peek phase, with a captured event log. */
function seated() {
  const room = new Room("seed");
  const a = room.join("a").playerId;
  const b = room.join("b").playerId;

  const captured: GameEvent[] = [];
  room.onChange((events) => captured.push(...events));
  room.start();

  return { room, a, b, captured };
}

describe("events reaching other players", () => {
  test("reports what happened without pre-redacting it", () => {
    const { room, a, captured } = seated();
    room.act(a, { type: "peek_card", slot: 0 });

    expect(captured).toContainEqual(
      expect.objectContaining({ type: "peeked", playerId: a, card: expect.any(Number) }),
    );
  });

  test("gives the peeker the value", () => {
    const { room, a, captured } = seated();
    room.act(a, { type: "peek_card", slot: 0 });

    expect(room.eventsFor(captured, a)[0]).toHaveProperty("card");
  });

  test("gives everyone else the slot but not the value", () => {
    const { room, a, b, captured } = seated();
    room.act(a, { type: "peek_card", slot: 0 });

    const forB = room.eventsFor(captured, b)[0]!;

    expect(forB).not.toHaveProperty("card");
    expect(forB).toMatchObject({ type: "peeked", playerId: a, slot: 0 });
  });

  test("never leaks a drawn card to the other player", () => {
    const { room, a, b, captured } = seated();
    room.act(a, { type: "ready" });
    room.act(b, { type: "ready" });
    captured.length = 0;

    const active = room.viewFor(a).currentPlayerId!;
    room.act(active, { type: "draw" });

    const other = active === a ? b : a;
    const drew = room
      .eventsFor(captured, other)
      .find((event) => event.type === "drew")!;

    expect(drew).not.toHaveProperty("card");
  });
});

describe("who is in the room", () => {
  test("lists every seated player's id", () => {
    const { room, a, b } = seated();

    expect(room.playerIds).toEqual([a, b]);
  });
});
