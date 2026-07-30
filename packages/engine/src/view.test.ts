import { describe, expect, test } from "vitest";
import type { GameEvent } from "./events.js";
import { applyAction, createGame } from "./game.js";
import { redactEvent, viewFor } from "./view.js";
import { stack, startedGame } from "./test-helpers.js";

const board = () =>
  stack(startedGame(["a", "b"]), {
    hands: { a: [1, 2, 3, 4], b: [5, 6, 7, 8] },
    draw: [11, 9],
    discard: [10],
  });

describe("viewFor", () => {
  test("never reveals another player's cards", () => {
    const view = viewFor(board(), "a");
    const other = view.players.find((player) => player.id === "b")!;

    expect(other.slots).toEqual([true, true, true, true]);
  });

  test("does not reveal your own cards either — memory is the game", () => {
    const view = viewFor(board(), "a");
    const you = view.players.find((player) => player.id === "a")!;

    expect(you.slots).toEqual([true, true, true, true]);
  });

  test("shows which slots a match has emptied", () => {
    const view = viewFor(stack(board(), { hands: { b: [5, null, 7, null] } }), "a");
    const other = view.players.find((player) => player.id === "b")!;

    expect(other.slots).toEqual([true, false, true, false]);
  });

  test("shows the face-up top of the discard pile", () => {
    expect(viewFor(board(), "a").discardTop).toBe(10);
  });

  test("shows how many cards are left to draw, not which", () => {
    const view = viewFor(board(), "a");

    expect(view.drawPileCount).toBe(2);
    expect(view).not.toHaveProperty("drawPile");
  });

  test("shows a drawn card only to the player holding it", () => {
    const drawn = applyAction(board(), "a", { type: "draw" }).state;

    expect(viewFor(drawn, "a").heldCard).toBe(9);
    expect(viewFor(drawn, "b").heldCard).toBeNull();
  });

  test("tells others that a card is being held without saying which", () => {
    const drawn = applyAction(board(), "a", { type: "draw" }).state;

    expect(viewFor(drawn, "b").someoneIsHolding).toBe(true);
  });

  test("reveals every hand once the round is scored", () => {
    const called = applyAction(board(), "a", { type: "call_cabo" }).state;
    const drew = applyAction(called, "b", { type: "draw" }).state;
    const over = applyAction(drew, "b", { type: "discard_drawn" }).state;

    expect(viewFor(over, "b").revealedHands).toEqual([
      { playerId: "a", slots: [1, 2, 3, 4] },
      { playerId: "b", slots: [5, 6, 7, 8] },
    ]);
  });

  test("reveals nothing while the round is still being played", () => {
    expect(viewFor(board(), "a").revealedHands).toBeNull();
  });

  test("carries the public table state", () => {
    const view = viewFor(board(), "a");

    expect(view.phase).toBe("playing");
    expect(view.currentPlayerId).toBe("a");
    expect(view.caboCalledBy).toBeNull();
    expect(view.players.map((player) => player.totalScore)).toEqual([0, 0]);
  });
});

describe("redactEvent", () => {
  const peeked = {
    type: "peeked",
    playerId: "a",
    slot: 2,
    card: 3,
  } as const;

  test("shows a peeked card to the player who peeked", () => {
    expect(redactEvent(peeked, "a")).toEqual(peeked);
  });

  test("shows others the slot that was peeked but not its value", () => {
    expect(redactEvent(peeked, "b")).toEqual({
      type: "peeked",
      playerId: "a",
      slot: 2,
    });
  });

  const spied = {
    type: "spied",
    playerId: "a",
    targetPlayerId: "b",
    slot: 1,
    card: 6,
  } as const;

  test("shows a spied card only to the spy", () => {
    expect(redactEvent(spied, "a")).toEqual(spied);
  });

  test("tells the target which of their cards was inspected, not its value", () => {
    expect(redactEvent(spied, "b")).toEqual({
      type: "spied",
      playerId: "a",
      targetPlayerId: "b",
      slot: 1,
    });
  });

  const drew = { type: "drew", playerId: "a", card: 9 } as const;

  test("shows a drawn card only to the player who drew it", () => {
    expect(redactEvent(drew, "a")).toEqual(drew);
    expect(redactEvent(drew, "b")).toEqual({ type: "drew", playerId: "a" });
  });

  test("keeps a failed match fully public — everyone sees those cards", () => {
    const failed: GameEvent = {
      type: "match_failed",
      playerId: "a",
      revealed: [{ slot: 0, card: 3 }],
      discarded: 1,
    };

    expect(redactEvent(failed, "b")).toEqual(failed);
  });

  test("keeps the discard pile public", () => {
    const discarded = { type: "discarded", playerId: "a", card: 9 } as const;

    expect(redactEvent(discarded, "b")).toEqual(discarded);
  });

  test("keeps a swap's positions public and its values hidden", () => {
    const swapped = {
      type: "swapped",
      playerId: "a",
      ownSlot: 0,
      targetPlayerId: "b",
      targetSlot: 3,
    } as const;

    expect(redactEvent(swapped, "b")).toEqual(swapped);
  });
});

describe("peek positions", () => {
  test("shows which slots a player has looked at — public by design", () => {
    const game = createGame({ playerIds: ["a", "b"], seed: 1 });
    const peeked = applyAction(game, "a", { type: "peek_card", slot: 2 }).state;

    const view = viewFor(peeked, "b");

    expect(view.players.find((player) => player.id === "a")!.peeksUsed).toEqual([2]);
  });
});
