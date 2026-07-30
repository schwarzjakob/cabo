import { describe, expect, test } from "vitest";
import { applyAction } from "./game.js";
import { stack, startedGame } from "./test-helpers.js";
import type { Card } from "./deck.js";
import type { GameState } from "./types.js";

/** `a` holds `hand`, and draws `drawn` on its turn. */
const drawnOnto = (hand: (Card | null)[], drawn: Card): GameState =>
  applyAction(
    stack(startedGame(["a", "b"]), {
      hands: { a: hand, b: [5, 6, 7, 8] },
      draw: [0, drawn],
      discard: [10],
    }),
    "a",
    { type: "draw" },
  ).state;

const handOf = (state: GameState, id: string) =>
  state.players.find((player) => player.id === id)!.slots;

describe("successful match", () => {
  test("empties the matched slots and fills the chosen one", () => {
    const { state } = applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

    expect(handOf(state, "a")).toEqual([1, null, 5, 6]);
  });

  test("puts the matched cards on the discard pile", () => {
    const { state } = applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

    expect(state.discardPile).toEqual([10, 3, 3]);
  });

  test("shrinks a hand to two cards on a three-of-a-kind", () => {
    const { state } = applyAction(drawnOnto([4, 4, 4, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1, 2], into: 2 },
    });

    expect(handOf(state, "a")).toEqual([null, null, 1, 6]);
  });

  test("shrinks a hand to one card on a four-of-a-kind", () => {
    const { state } = applyAction(drawnOnto([2, 2, 2, 2], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1, 2, 3], into: 3 },
    });

    expect(handOf(state, "a")).toEqual([null, null, null, 1]);
  });

  test("reports the matched value, which everyone can see on the pile", () => {
    const { events } = applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

    expect(events).toContainEqual({
      type: "match_succeeded",
      playerId: "a",
      slots: [0, 1],
      into: 0,
      matchedValue: 3,
    });
  });

  test("holds the turn open so the table can see the traded cards", () => {
    const { state } = applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
  });

  test("passes the turn on once the player is done", () => {
    const matched = applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    }).state;

    expect(applyAction(matched, "a", { type: "end_turn" }).state.currentPlayerId)
      .toBe("b");
  });

  test("works with a card taken from the discard pile", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [3, 3, 5, 6], b: [5, 6, 7, 8] },
      draw: [0, 0],
      discard: [1],
    });

    const { state } = applyAction(board, "a", {
      type: "take_discard",
      target: { kind: "match", slots: [0, 1], into: 1 },
    });

    expect(handOf(state, "a")).toEqual([null, 1, 5, 6]);
    expect(state.discardPile).toEqual([3, 3]);
  });
});

describe("failed match", () => {
  const failed = () =>
    applyAction(drawnOnto([3, 4, 5, 6], 1), "a", {
      type: "place_drawn",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

  test("puts every attempted card back where it was", () => {
    expect(handOf(failed().state, "a")).toEqual([3, 4, 5, 6]);
  });

  test("shows the attempted cards to everyone at the table", () => {
    expect(failed().events).toContainEqual({
      type: "match_failed",
      playerId: "a",
      revealed: [
        { slot: 0, card: 3 },
        { slot: 1, card: 4 },
      ],
      discarded: 1,
    });
  });

  test("discards the attempted replacement card", () => {
    expect(failed().state.discardPile).toEqual([10, 1]);
  });

  test("loses the turn once the reveal has been seen", () => {
    const shown = failed().state;

    expect(shown.turnStage).toBe("resolving");
    expect(applyAction(shown, "a", { type: "end_turn" }).state.currentPlayerId)
      .toBe("b");
  });

  test("also applies to a card taken from the discard pile", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [3, 4, 5, 6], b: [5, 6, 7, 8] },
      draw: [0, 0],
      discard: [1],
    });

    const { state } = applyAction(board, "a", {
      type: "take_discard",
      target: { kind: "match", slots: [0, 1], into: 0 },
    });

    expect(handOf(state, "a")).toEqual([3, 4, 5, 6]);
    expect(state.discardPile).toEqual([1]);
  });
});

describe("invalid match attempts", () => {
  test("rejects a single slot — that is an ordinary replacement", () => {
    expect(() =>
      applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
        type: "place_drawn",
        target: { kind: "match", slots: [0], into: 0 },
      }),
    ).toThrow(/at least two/i);
  });

  test("rejects a target slot outside the matched set", () => {
    expect(() =>
      applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
        type: "place_drawn",
        target: { kind: "match", slots: [0, 1], into: 2 },
      }),
    ).toThrow(/one of the matched/i);
  });

  test("rejects the same slot listed twice", () => {
    expect(() =>
      applyAction(drawnOnto([3, 3, 5, 6], 1), "a", {
        type: "place_drawn",
        target: { kind: "match", slots: [0, 0], into: 0 },
      }),
    ).toThrow(/twice/i);
  });

  test("rejects an already emptied slot", () => {
    expect(() =>
      applyAction(drawnOnto([3, null, 5, 6], 1), "a", {
        type: "place_drawn",
        target: { kind: "match", slots: [0, 1], into: 0 },
      }),
    ).toThrow(/empty/i);
  });
});
