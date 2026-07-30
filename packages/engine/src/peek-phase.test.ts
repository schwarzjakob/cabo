import { beforeEach, describe, expect, test } from "vitest";
import { applyAction, createGame } from "./game.js";
import type { GameState } from "./types.js";

describe("peek phase", () => {
  let game: GameState;

  beforeEach(() => {
    game = createGame({ playerIds: ["a", "b"], seed: 1 });
  });

  test("lets a player look at one of their own cards", () => {
    const { events } = applyAction(game, "a", { type: "peek_card", slot: 0 });

    expect(events).toContainEqual({
      type: "peeked",
      playerId: "a",
      slot: 0,
      card: game.players[0]!.slots[0],
    });
  });

  test("lets a player look at two of their own cards", () => {
    let state = applyAction(game, "a", { type: "peek_card", slot: 0 }).state;
    state = applyAction(state, "a", { type: "peek_card", slot: 3 }).state;

    expect(state.players[0]!.peeksUsed).toEqual([0, 3]);
  });

  test("rejects a third peek", () => {
    let state = applyAction(game, "a", { type: "peek_card", slot: 0 }).state;
    state = applyAction(state, "a", { type: "peek_card", slot: 1 }).state;

    expect(() =>
      applyAction(state, "a", { type: "peek_card", slot: 2 }),
    ).toThrow(/two cards/i);
  });

  test("rejects peeking the same slot twice", () => {
    const state = applyAction(game, "a", { type: "peek_card", slot: 0 }).state;

    expect(() =>
      applyAction(state, "a", { type: "peek_card", slot: 0 }),
    ).toThrow(/already/i);
  });

  test("rejects peeking a slot that does not exist", () => {
    expect(() => applyAction(game, "a", { type: "peek_card", slot: 4 })).toThrow(
      /slot/i,
    );
  });

  test("stays in the peek phase until every player is ready", () => {
    const state = applyAction(game, "a", { type: "ready" }).state;

    expect(state.phase).toBe("peeking");
  });

  test("starts play once every player is ready", () => {
    let state = applyAction(game, "a", { type: "ready" }).state;
    state = applyAction(state, "b", { type: "ready" }).state;

    expect(state.phase).toBe("playing");
  });

  test("gives the first turn to the first player in round one", () => {
    let state = applyAction(game, "a", { type: "ready" }).state;
    state = applyAction(state, "b", { type: "ready" }).state;

    expect(state.currentPlayerId).toBe("a");
  });

  test("rejects turn actions before play has started", () => {
    expect(() => applyAction(game, "a", { type: "draw" })).toThrow(/peek/i);
  });

  test("rejects peeking once play has started", () => {
    let state = applyAction(game, "a", { type: "ready" }).state;
    state = applyAction(state, "b", { type: "ready" }).state;

    expect(() =>
      applyAction(state, "a", { type: "peek_card", slot: 1 }),
    ).toThrow(/peek/i);
  });

  test("rejects an unknown player", () => {
    expect(() => applyAction(game, "zzz", { type: "ready" })).toThrow(/player/i);
  });
});
