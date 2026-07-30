import { describe, expect, test } from "vitest";
import { createGame } from "./game.js";
import { createDeck } from "./deck.js";

const sorted = (cards: readonly number[]) => [...cards].sort((a, b) => a - b);

describe("createGame", () => {
  test("deals four cards to every player", () => {
    const game = createGame({ playerIds: ["a", "b", "c"], seed: 1 });

    expect(game.players.map((player) => player.slots.length)).toEqual([4, 4, 4]);
  });

  test("turns one card face up to start the discard pile", () => {
    const game = createGame({ playerIds: ["a", "b"], seed: 1 });

    expect(game.discardPile).toHaveLength(1);
  });

  test("leaves every undealt card in the draw pile", () => {
    const game = createGame({ playerIds: ["a", "b", "c"], seed: 1 });

    expect(game.drawPile).toHaveLength(52 - 3 * 4 - 1);
  });

  test("uses each card of the deck exactly once", () => {
    const game = createGame({ playerIds: ["a", "b", "c", "d"], seed: 5 });

    const inPlay = [
      ...game.drawPile,
      ...game.discardPile,
      ...game.players.flatMap((player) => player.slots),
    ].filter((card): card is number => card !== null);

    expect(sorted(inPlay)).toEqual(sorted(createDeck()));
  });

  test("starts in the peek phase so players can view two cards", () => {
    const game = createGame({ playerIds: ["a", "b"], seed: 1 });

    expect(game.phase).toBe("peeking");
  });

  test("starts every player on zero cumulative score", () => {
    const game = createGame({ playerIds: ["a", "b"], seed: 1 });

    expect(game.players.map((player) => player.totalScore)).toEqual([0, 0]);
  });

  test("deals the same cards for the same seed", () => {
    const a = createGame({ playerIds: ["a", "b"], seed: 99 });
    const b = createGame({ playerIds: ["a", "b"], seed: 99 });

    expect(a.players).toEqual(b.players);
    expect(a.drawPile).toEqual(b.drawPile);
  });

  test("rejects fewer than two players", () => {
    expect(() => createGame({ playerIds: ["a"], seed: 1 })).toThrow(/2 to 5/);
  });

  test("rejects more than five players", () => {
    expect(() =>
      createGame({ playerIds: ["a", "b", "c", "d", "e", "f"], seed: 1 }),
    ).toThrow(/2 to 5/);
  });
});
