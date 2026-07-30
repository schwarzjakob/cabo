import { describe, expect, test } from "vitest";
import { applyAction } from "./game.js";
import { stack, startedGame } from "./test-helpers.js";

const board = () =>
  stack(startedGame(["a", "b"]), {
    hands: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
    draw: [13, 9],
    discard: [4],
  });

const handOf = (state: ReturnType<typeof board>, id: string) =>
  state.players.find((player) => player.id === id)!.slots;

describe("turn order", () => {
  test("rejects an action from a player whose turn it is not", () => {
    expect(() => applyAction(board(), "b", { type: "draw" })).toThrow(/turn/i);
  });

  test("passes the turn to the next player clockwise", () => {
    const state = applyAction(board(), "a", { type: "draw" }).state;

    expect(applyAction(state, "a", { type: "discard_drawn" }).state
      .currentPlayerId).toBe("b");
  });

  test("wraps back to the first player", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", { type: "discard_drawn" }).state;
    state = applyAction(state, "b", { type: "draw" }).state;
    state = applyAction(state, "b", { type: "discard_drawn" }).state;

    expect(state.currentPlayerId).toBe("a");
  });
});

describe("drawing from the draw pile", () => {
  test("takes the top card of the draw pile", () => {
    const { state } = applyAction(board(), "a", { type: "draw" });

    expect(state.heldCard).toBe(9);
    expect(state.drawPile).toEqual([13]);
  });

  test("rejects drawing twice in one turn", () => {
    const state = applyAction(board(), "a", { type: "draw" }).state;

    expect(() => applyAction(state, "a", { type: "draw" })).toThrow(/already/i);
  });

  test("rejects placing a card that was never drawn", () => {
    expect(() =>
      applyAction(board(), "a", {
        type: "place_drawn",
        target: { kind: "slot", slot: 0 },
      }),
    ).toThrow(/not holding/i);
  });
});

describe("placing a drawn card", () => {
  test("puts the drawn card into the chosen slot", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 2 },
    }).state;

    expect(handOf(state, "a")).toEqual([1, 2, 9, 4]);
  });

  test("discards the card it replaced", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 2 },
    }).state;

    expect(state.discardPile).toEqual([4, 3]);
  });

  test("leaves the player holding nothing", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 2 },
    }).state;

    expect(state.heldCard).toBeNull();
  });

  test("rejects a slot emptied by an earlier match", () => {
    const emptied = stack(board(), { hands: { a: [1, null, 3, 4] } });
    const state = applyAction(emptied, "a", { type: "draw" }).state;

    expect(() =>
      applyAction(state, "a", {
        type: "place_drawn",
        target: { kind: "slot", slot: 1 },
      }),
    ).toThrow(/empty/i);
  });
});

describe("discarding a drawn card", () => {
  test("puts the drawn card on the discard pile", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", { type: "discard_drawn" }).state;

    expect(state.discardPile).toEqual([4, 9]);
  });

  test("leaves the hand untouched", () => {
    let state = applyAction(board(), "a", { type: "draw" }).state;
    state = applyAction(state, "a", { type: "discard_drawn" }).state;

    expect(handOf(state, "a")).toEqual([1, 2, 3, 4]);
  });
});

describe("taking the top of the discard pile", () => {
  const takenThenPlaced = () => {
    const taken = applyAction(board(), "a", { type: "take_discard" }).state;
    return applyAction(taken, "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 0 },
    }).state;
  };

  test("puts the discarded card into the chosen slot", () => {
    expect(handOf(takenThenPlaced(), "a")).toEqual([4, 2, 3, 4]);
  });

  test("leaves the replaced card as the new top discard", () => {
    expect(takenThenPlaced().discardPile).toEqual([1]);
  });

  test("passes the turn on", () => {
    expect(takenThenPlaced().currentPlayerId).toBe("b");
  });

  test("cannot simply be thrown away again", () => {
    const taken = applyAction(board(), "a", { type: "take_discard" }).state;

    expect(() => applyAction(taken, "a", { type: "discard_drawn" })).toThrow(
      /into your hand/i,
    );
  });

  test("rejects taking from the discard pile while holding a drawn card", () => {
    const state = applyAction(board(), "a", { type: "draw" }).state;

    expect(() => applyAction(state, "a", { type: "take_discard" })).toThrow(
      /holding/i,
    );
  });
});
