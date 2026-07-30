import { describe, expect, test } from "vitest";
import { applyAction } from "./game.js";
import { stack, startedGame } from "./test-helpers.js";
import type { Card } from "./deck.js";
import type { GameState } from "./types.js";

const drawnOnto = (hand: (Card | null)[], drawn: Card): GameState =>
  applyAction(
    stack(startedGame(["a", "b"]), {
      hands: { a: hand, b: [5, 6, 7, 8] },
      draw: [0, drawn],
      discard: [4],
    }),
    "a",
    { type: "draw" },
  ).state;

describe("actions that tell you something hold the turn open", () => {
  test("Peek leaves the turn with you so you can look", () => {
    const { state } = applyAction(drawnOnto([1, 2, 3, 4], 7), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    });

    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
  });

  test("Spy leaves the turn with you", () => {
    const { state } = applyAction(drawnOnto([1, 2, 3, 4], 9), "a", {
      type: "use_power",
      target: { kind: "spy", playerId: "b", slot: 1 },
    });

    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
  });

  test("Swap leaves the turn with you, to register what moved", () => {
    const { state } = applyAction(drawnOnto([1, 2, 3, 4], 11), "a", {
      type: "use_power",
      target: { kind: "swap", ownSlot: 0, playerId: "b", theirSlot: 3 },
    });

    expect(state.turnStage).toBe("resolving");
  });

  test("a successful match holds the turn open so the table can see it", () => {
    let state = drawnOnto([3, 3, 5, 6], 1);
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 0 }).state;
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 1 }).state;
    state = applyAction(state, "a", { type: "commit_match", into: 0 }).state;

    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
  });

  test("a failed match holds the turn open too", () => {
    let state = drawnOnto([3, 4, 5, 6], 1);
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 0 }).state;
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 1 }).state;

    expect(state.turnStage).toBe("resolving");
  });
});

describe("ordinary actions still pass the turn straight on", () => {
  test("discarding a drawn card ends the turn", () => {
    const { state } = applyAction(drawnOnto([1, 2, 3, 4], 3), "a", {
      type: "discard_drawn",
    });

    expect(state.currentPlayerId).toBe("b");
    expect(state.turnStage).toBe("acting");
  });

  test("keeping a drawn card ends the turn", () => {
    const { state } = applyAction(drawnOnto([1, 2, 3, 4], 3), "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 0 },
    });

    expect(state.currentPlayerId).toBe("b");
  });

  test("taking the discard into a slot ends the turn", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
      draw: [0, 0],
      discard: [9],
    });

    const taken = applyAction(board, "a", { type: "take_discard" }).state;
    const { state } = applyAction(taken, "a", {
      type: "place_drawn",
      target: { kind: "slot", slot: 0 },
    });

    expect(state.currentPlayerId).toBe("b");
  });
});

describe("ending a held-open turn", () => {
  const resolving = () =>
    applyAction(drawnOnto([1, 2, 3, 4], 7), "a", {
      type: "use_power",
      target: { kind: "peek", slot: 2 },
    }).state;

  test("passes the turn on when you say you are done", () => {
    const { state } = applyAction(resolving(), "a", { type: "end_turn" });

    expect(state.currentPlayerId).toBe("b");
    expect(state.turnStage).toBe("acting");
  });

  test("refuses every other action while you are still looking", () => {
    expect(() => applyAction(resolving(), "a", { type: "draw" })).toThrow(
      /done/i,
    );
  });

  test("cannot be done by anyone but the player whose turn it is", () => {
    expect(() => applyAction(resolving(), "b", { type: "end_turn" })).toThrow(
      /turn/i,
    );
  });

  test("is refused when there is nothing to finish", () => {
    expect(() =>
      applyAction(drawnOnto([1, 2, 3, 4], 7), "a", { type: "end_turn" }),
    ).toThrow(/nothing/i);
  });

  test("still ends the round when the Cabo caller comes back around", () => {
    const called = applyAction(
      stack(startedGame(["a", "b"]), {
        hands: { a: [1, 1, 1, 1], b: [5, 5, 5, 5] },
        draw: [7, 7],
        discard: [4],
      }),
      "a",
      { type: "call_cabo" },
    ).state;

    const drew = applyAction(called, "b", { type: "draw" }).state;
    const peeked = applyAction(drew, "b", {
      type: "use_power",
      target: { kind: "peek", slot: 0 },
    }).state;

    expect(peeked.phase).toBe("playing");
    expect(applyAction(peeked, "b", { type: "end_turn" }).state.phase).toBe(
      "roundOver",
    );
  });
});
