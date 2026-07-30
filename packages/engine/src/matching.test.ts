import { describe, expect, test } from "vitest";
import { applyAction } from "./game.js";
import { stack, startedGame } from "./test-helpers.js";
import type { Card } from "./deck.js";
import type { GameState } from "./types.js";

/** `a` holding `drawn`, with `hand` in front of them. */
const holding = (hand: (Card | null)[], drawn: Card): GameState =>
  applyAction(
    stack(startedGame(["a", "b"]), {
      hands: { a: hand, b: [5, 6, 7, 8] },
      draw: [0, drawn],
      discard: [4],
    }),
    "a",
    { type: "draw" },
  ).state;

const handOf = (state: GameState, id: string) =>
  state.players.find((player) => player.id === id)!.slots;

const reveal = (state: GameState, slot: number) =>
  applyAction(state, "a", { type: "reveal_for_match", slot });

describe("revealing cards one at a time", () => {
  test("turns the card face up for everyone", () => {
    const { events } = reveal(holding([3, 3, 5, 6], 1), 0);

    expect(events).toContainEqual({
      type: "match_revealed",
      playerId: "a",
      slot: 0,
      card: 3,
    });
  });

  test("keeps the card in place until the trade is committed", () => {
    const { state } = reveal(holding([3, 3, 5, 6], 1), 0);

    expect(handOf(state, "a")).toEqual([3, 3, 5, 6]);
  });

  test("remembers what has been turned over so far", () => {
    let state = reveal(holding([3, 3, 5, 6], 1), 0).state;
    state = reveal(state, 1).state;

    expect(state.matchAttempt?.revealed).toEqual([0, 1]);
  });

  test("refuses to turn the same card over twice", () => {
    const state = reveal(holding([3, 3, 5, 6], 1), 0).state;

    expect(() => reveal(state, 0)).toThrow(/already/i);
  });

  test("refuses a slot emptied by an earlier match", () => {
    expect(() => reveal(holding([3, null, 5, 6], 1), 1)).toThrow(/empty/i);
  });

  test("cannot start without a card to trade for", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [3, 3, 5, 6], b: [5, 6, 7, 8] },
      draw: [0, 1],
      discard: [4],
    });

    expect(() =>
      applyAction(board, "a", { type: "reveal_for_match", slot: 0 }),
    ).toThrow(/not holding/i);
  });
});

describe("a reveal that breaks the match", () => {
  const broken = () => {
    const state = reveal(holding([3, 4, 5, 6], 1), 0).state;
    return reveal(state, 1);
  };

  test("fails the attempt the moment the cards disagree", () => {
    expect(broken().events).toContainEqual({
      type: "match_failed",
      playerId: "a",
      revealed: [
        { slot: 0, card: 3 },
        { slot: 1, card: 4 },
      ],
      discarded: 1,
    });
  });

  test("puts every revealed card back where it was", () => {
    expect(handOf(broken().state, "a")).toEqual([3, 4, 5, 6]);
  });

  test("discards the card that was going to be traded in", () => {
    expect(broken().state.discardPile).toEqual([4, 1]);
  });

  test("loses the turn, once the table has seen it", () => {
    const { state } = broken();

    expect(state.turnStage).toBe("resolving");
    expect(state.matchAttempt).toBeNull();
    expect(applyAction(state, "a", { type: "end_turn" }).state.currentPlayerId)
      .toBe("b");
  });
});

describe("committing a match", () => {
  const twoOfAKind = () => {
    const state = reveal(holding([3, 3, 5, 6], 1), 0).state;
    return reveal(state, 1).state;
  };

  test("empties the traded slots and fills the chosen one", () => {
    const { state } = applyAction(twoOfAKind(), "a", {
      type: "commit_match",
      into: 0,
    });

    expect(handOf(state, "a")).toEqual([1, null, 5, 6]);
  });

  test("puts the traded cards on the discard pile", () => {
    const { state } = applyAction(twoOfAKind(), "a", {
      type: "commit_match",
      into: 0,
    });

    expect(state.discardPile).toEqual([4, 3, 3]);
  });

  test("holds the turn open so the table can take it in", () => {
    const { state } = applyAction(twoOfAKind(), "a", {
      type: "commit_match",
      into: 0,
    });

    expect(state.currentPlayerId).toBe("a");
    expect(state.turnStage).toBe("resolving");
  });

  test("needs at least two cards turned over", () => {
    const one = reveal(holding([3, 3, 5, 6], 1), 0).state;

    expect(() =>
      applyAction(one, "a", { type: "commit_match", into: 0 }),
    ).toThrow(/at least two/i);
  });

  test("must put the replacement into one of the revealed slots", () => {
    expect(() =>
      applyAction(twoOfAKind(), "a", { type: "commit_match", into: 2 }),
    ).toThrow(/one of the/i);
  });

  test("lets a third card be risked after two already match", () => {
    let state = reveal(holding([4, 4, 4, 6], 1), 0).state;
    state = reveal(state, 1).state;
    state = reveal(state, 2).state;

    const { state: traded } = applyAction(state, "a", {
      type: "commit_match",
      into: 2,
    });

    expect(handOf(traded, "a")).toEqual([null, null, 1, 6]);
  });

  test("punishes a third card that does not match, after two that did", () => {
    let state = reveal(holding([4, 4, 9, 6], 1), 0).state;
    state = reveal(state, 1).state;
    const { state: failed } = reveal(state, 2);

    expect(handOf(failed, "a")).toEqual([4, 4, 9, 6]);
    expect(failed.matchAttempt).toBeNull();
  });

  test("works with a card taken from the discard pile", () => {
    const board = stack(startedGame(["a", "b"]), {
      hands: { a: [3, 3, 5, 6], b: [5, 6, 7, 8] },
      draw: [0, 0],
      discard: [1],
    });

    let state = applyAction(board, "a", { type: "take_discard" }).state;
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 0 }).state;
    state = applyAction(state, "a", { type: "reveal_for_match", slot: 1 }).state;
    state = applyAction(state, "a", { type: "commit_match", into: 1 }).state;

    expect(handOf(state, "a")).toEqual([null, 1, 5, 6]);
  });
});

describe("while a match is being revealed", () => {
  const midReveal = () => reveal(holding([3, 3, 5, 6], 1), 0).state;

  test("the card cannot simply be discarded instead", () => {
    expect(() =>
      applyAction(midReveal(), "a", { type: "discard_drawn" }),
    ).toThrow(/match/i);
  });

  test("the card cannot be quietly placed in a slot instead", () => {
    expect(() =>
      applyAction(midReveal(), "a", {
        type: "place_drawn",
        target: { kind: "slot", slot: 3 },
      }),
    ).toThrow(/match/i);
  });
});
