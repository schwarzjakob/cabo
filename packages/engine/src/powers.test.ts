import { describe, expect, test } from "vitest";
import { powerOf } from "./deck.js";
import { applyAction } from "./game.js";
import { stack, startedGame } from "./test-helpers.js";
import type { Card } from "./deck.js";
import type { GameState } from "./types.js";

/** `a` to move, holding whatever `drawn` is once it draws. */
const boardWith = (drawn: Card): GameState =>
  stack(startedGame(["a", "b"]), {
    hands: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
    draw: [0, drawn],
    discard: [10],
  });

const drawInto = (drawn: Card) =>
  applyAction(boardWith(drawn), "a", { type: "draw" }).state;

const handOf = (state: GameState, id: string) =>
  state.players.find((player) => player.id === id)!.slots;

describe("powerOf", () => {
  test("7 and 8 peek at your own card", () => {
    expect(powerOf(7)).toBe("peek");
    expect(powerOf(8)).toBe("peek");
  });

  test("9 and 10 spy on another player's card", () => {
    expect(powerOf(9)).toBe("spy");
    expect(powerOf(10)).toBe("spy");
  });

  test("11 and 12 swap two cards", () => {
    expect(powerOf(11)).toBe("swap");
    expect(powerOf(12)).toBe("swap");
  });

  test("every other card has no power", () => {
    for (const card of [0, 1, 2, 3, 4, 5, 6, 13]) {
      expect(powerOf(card)).toBeNull();
    }
  });
});

describe("Peek", () => {
  test("reveals one of your own cards", () => {
    const { events } = applyAction(drawInto(7), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    });

    expect(events).toContainEqual({
      type: "peeked",
      playerId: "a",
      slot: 2,
      card: 3,
    });
  });

  test("discards the choice card and holds the turn open for the look", () => {
    const { state } = applyAction(drawInto(7), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    });

    expect(state.discardPile).toEqual([10, 7]);
    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
    expect(state.heldCard).toBeNull();
  });

  test("passes the turn on once the player is done looking", () => {
    const peeked = applyAction(drawInto(7), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    }).state;

    expect(applyAction(peeked, "a", { type: "end_turn" }).state.currentPlayerId)
      .toBe("b");
  });

  test("leaves the hand untouched", () => {
    const { state } = applyAction(drawInto(8), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    });

    expect(handOf(state, "a")).toEqual([1, 2, 3, 4]);
  });
});

describe("Spy", () => {
  test("reveals another player's card", () => {
    const { events } = applyAction(drawInto(9), "a", {
      type: "use_power",
      target: { kind: "spy", playerId: "b", slot: 1 },
    });

    expect(events).toContainEqual({
      type: "spied",
      playerId: "a",
      targetPlayerId: "b",
      slot: 1,
      card: 6,
    });
  });

  test("cannot be aimed at yourself", () => {
    expect(() =>
      applyAction(drawInto(10), "a", {
        type: "use_power",
        target: { kind: "spy", playerId: "a", slot: 1 },
      }),
    ).toThrow(/another player/i);
  });

  test("cannot be aimed at an empty slot", () => {
    const board = stack(drawInto(9), { hands: { b: [5, null, 7, 8] } });

    expect(() =>
      applyAction(board, "a", {
        type: "use_power",
        target: { kind: "spy", playerId: "b", slot: 1 },
      }),
    ).toThrow(/empty/i);
  });
});

describe("Swap", () => {
  test("exchanges your card with another player's", () => {
    const { state } = applyAction(drawInto(11), "a", {
      type: "use_power",
      target: { kind: "swap", ownSlot: 0, playerId: "b", theirSlot: 3 },
    });

    expect(handOf(state, "a")).toEqual([8, 2, 3, 4]);
    expect(handOf(state, "b")).toEqual([5, 6, 7, 1]);
  });

  test("reports the swap without revealing either value", () => {
    const { events } = applyAction(drawInto(12), "a", {
      type: "use_power",
      target: { kind: "swap", ownSlot: 0, playerId: "b", theirSlot: 3 },
    });

    expect(events).toContainEqual({
      type: "swapped",
      playerId: "a",
      ownSlot: 0,
      targetPlayerId: "b",
      targetSlot: 3,
    });
  });

  test("cannot be aimed at yourself", () => {
    expect(() =>
      applyAction(drawInto(11), "a", {
        type: "use_power",
        target: { kind: "swap", ownSlot: 0, playerId: "a", theirSlot: 3 },
      }),
    ).toThrow(/another player/i);
  });

  test("cannot involve an empty slot", () => {
    const board = stack(drawInto(11), { hands: { a: [null, 2, 3, 4] } });

    expect(() =>
      applyAction(board, "a", {
        type: "use_power",
        target: { kind: "swap", ownSlot: 0, playerId: "b", theirSlot: 3 },
      }),
    ).toThrow(/empty/i);
  });
});

describe("power restrictions", () => {
  test("rejects a power the held card does not have", () => {
    expect(() =>
      applyAction(drawInto(7), "a", {
        type: "use_power",
        target: { kind: "spy", playerId: "b", slot: 1 },
      }),
    ).toThrow(/does not have/i);
  });

  test("rejects using a power on a card that has none", () => {
    expect(() =>
      applyAction(drawInto(3), "a", {
        type: "use_power",
        target: { kind: "peek", slot: 1 },
      }),
    ).toThrow(/no power/i);
  });

  test("never grants a power on a card taken from the discard pile", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
      draw: [0, 0],
      discard: [9],
    });

    const { state } = applyAction(board, "a", {
      type: "take_discard",
      target: { kind: "slot", slot: 0 },
    });

    expect(handOf(state, "a")).toEqual([9, 2, 3, 4]);
    expect(state.currentPlayerId).toBe("b");
  });

  test("using the power is optional — the card may be kept for points", () => {
    const state = applyAction(drawInto(7), "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 0 },
    }).state;

    expect(handOf(state, "a")).toEqual([7, 2, 3, 4]);
  });

  test("using the power is optional — the card may just be discarded", () => {
    const state = applyAction(drawInto(11), "a", {
      type: "discard_drawn",
    }).state;

    expect(state.discardPile).toEqual([10, 11]);
    expect(handOf(state, "a")).toEqual([1, 2, 3, 4]);
  });
});
