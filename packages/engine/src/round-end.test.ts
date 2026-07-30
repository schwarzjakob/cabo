import { describe, expect, test } from "vitest";
import { applyAction, startNextRound } from "./game.js";
import { roundWinner } from "./scoring.js";
import { stack, startedGame } from "./test-helpers.js";
import type { GameState, PlayerId } from "./types.js";

/** `a` to move, with `a` holding 4 points and `b` holding 20. */
const board = (over?: Partial<Parameters<typeof stack>[1]>) =>
  stack(startedGame(["a", "b"]), {
    hands: { a: [1, 1, 1, 1], b: [5, 5, 5, 5] },
    draw: [2, 3, 4, 5],
    discard: [6],
    ...over,
  });

/** Play `b`'s single remaining turn after `a` has called Cabo. */
const finishAfterCabo = (state: GameState): GameState => {
  const drawn = applyAction(state, "b", { type: "draw" }).state;
  return applyAction(drawn, "b", { type: "discard_drawn" }).state;
};

const totalOf = (state: GameState, id: PlayerId) =>
  state.players.find((player) => player.id === id)!.totalScore;

describe("calling Cabo", () => {
  test("records the caller and passes the turn on", () => {
    const { state } = applyAction(board(), "a", { type: "call_cabo" });

    expect(state.caboCalledBy).toBe("a");
    expect(state.currentPlayerId).toBe("b");
  });

  test("cannot be done while holding a drawn card", () => {
    const drawn = applyAction(board(), "a", { type: "draw" }).state;

    expect(() => applyAction(drawn, "a", { type: "call_cabo" })).toThrow(
      /holding/i,
    );
  });

  test("cannot be called twice in a round", () => {
    const called = applyAction(board(), "a", { type: "call_cabo" }).state;

    expect(() => applyAction(called, "b", { type: "call_cabo" })).toThrow(
      /already/i,
    );
  });

  test("gives every other player exactly one more turn", () => {
    const called = applyAction(board(), "a", { type: "call_cabo" }).state;

    expect(finishAfterCabo(called).phase).toBe("roundOver");
  });

  test("does not give the caller another turn", () => {
    const called = applyAction(board(), "a", { type: "call_cabo" }).state;

    expect(() => applyAction(finishAfterCabo(called), "a", { type: "draw" }))
      .toThrow(/roundOver/i);
  });
});

describe("scoring a round", () => {
  const scored = (over?: Partial<Parameters<typeof stack>[1]>) =>
    finishAfterCabo(
      applyAction(board(over), "a", { type: "call_cabo" }).state,
    );

  test("adds each player's round score to their total", () => {
    const state = scored();

    expect(totalOf(state, "a")).toBe(0);
    expect(totalOf(state, "b")).toBe(20);
  });

  test("carries totals forward from earlier rounds", () => {
    const state = scored({ totals: { a: 12, b: 30 } });

    expect(totalOf(state, "a")).toBe(12);
    expect(totalOf(state, "b")).toBe(50);
  });

  test("reveals every hand, since everyone flips their cards", () => {
    const called = applyAction(board(), "a", { type: "call_cabo" }).state;
    const drawn = applyAction(called, "b", { type: "draw" }).state;
    const { events } = applyAction(drawn, "b", { type: "discard_drawn" });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "round_scored",
        hands: [
          { playerId: "a", slots: [1, 1, 1, 1] },
          { playerId: "b", slots: [5, 5, 5, 5] },
        ],
        scores: { a: 0, b: 20 },
      }),
    );
  });

  test("drops a total of exactly 100 down to 50", () => {
    const state = scored({ totals: { a: 0, b: 80 } });

    expect(totalOf(state, "b")).toBe(50);
  });

  test("ends the game once a player exceeds 100", () => {
    const state = scored({ totals: { a: 0, b: 81 } });

    expect(state.phase).toBe("gameOver");
    expect(totalOf(state, "b")).toBe(101);
  });

  test("keeps playing while every total is at or below 100", () => {
    expect(scored({ totals: { a: 0, b: 79 } }).phase).toBe("roundOver");
  });
});

describe("roundWinner", () => {
  test("is the only player who scored zero", () => {
    expect(
      roundWinner(
        [
          { id: "a", slots: [1, 1], totalScore: 0 },
          { id: "b", slots: [9, 9], totalScore: 0 },
        ],
        null,
      ),
    ).toBe("a");
  });

  test("is the Cabo caller when they win a tie", () => {
    expect(
      roundWinner(
        [
          { id: "a", slots: [2, 2], totalScore: 0 },
          { id: "b", slots: [2, 2], totalScore: 0 },
        ],
        "b",
      ),
    ).toBe("b");
  });

  test("breaks an uncalled tie by the lowest cumulative score", () => {
    expect(
      roundWinner(
        [
          { id: "a", slots: [2, 2], totalScore: 40 },
          { id: "b", slots: [2, 2], totalScore: 15 },
        ],
        null,
      ),
    ).toBe("b");
  });
});

describe("starting the next round", () => {
  const finished = () =>
    finishAfterCabo(applyAction(board(), "a", { type: "call_cabo" }).state);

  test("deals four fresh cards to everyone", () => {
    const next = startNextRound(finished(), 7);

    expect(next.players.map((player) => player.slots.length)).toEqual([4, 4]);
  });

  test("returns to the peek phase", () => {
    const next = startNextRound(finished(), 7);

    expect(next.phase).toBe("peeking");
    expect(next.players.every((player) => player.peeksUsed.length === 0)).toBe(
      true,
    );
  });

  test("keeps cumulative scores", () => {
    const next = startNextRound(finished(), 7);

    expect(totalOf(next, "b")).toBe(20);
  });

  test("gives the first turn to the winner of the previous round", () => {
    let next = startNextRound(finished(), 7);
    next = applyAction(next, "a", { type: "ready" }).state;
    next = applyAction(next, "b", { type: "ready" }).state;

    expect(next.currentPlayerId).toBe("a");
  });

  test("clears the Cabo call", () => {
    expect(startNextRound(finished(), 7).caboCalledBy).toBeNull();
  });

  test("refuses to start while a round is still being played", () => {
    expect(() => startNextRound(board(), 7)).toThrow(/round/i);
  });
});

describe("running out of cards", () => {
  test("reshuffles the discard pile into a new draw pile", () => {
    const empty = stack(startedGame(["a", "b"]), {
      hands: { a: [1, 1, 1, 1], b: [5, 5, 5, 5] },
      draw: [],
      discard: [2, 3, 4, 9],
    });

    const { state } = applyAction(empty, "a", { type: "draw" });

    expect(state.discardPile).toEqual([9]);
    expect([...state.drawPile, state.heldCard].sort()).toEqual([2, 3, 4]);
  });

  test("keeps the top discard face up rather than shuffling it in", () => {
    const empty = stack(startedGame(["a", "b"]), {
      hands: { a: [1, 1, 1, 1], b: [5, 5, 5, 5] },
      draw: [],
      discard: [2, 3, 4, 9],
    });

    const { state } = applyAction(empty, "a", { type: "draw" });

    expect(state.drawPile).not.toContain(9);
    expect(state.heldCard).not.toBe(9);
  });
});
