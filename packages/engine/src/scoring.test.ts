import { describe, expect, test } from "vitest";
import { handTotal, isKamikaze, scoreRound } from "./scoring.js";
import type { Card } from "./deck.js";
import type { PlayerId } from "./types.js";

const hand = (id: PlayerId, slots: (Card | null)[]) => ({ id, slots });

describe("handTotal", () => {
  test("adds up the cards", () => {
    expect(handTotal([1, 5, 12, 3])).toBe(21);
  });

  test("ignores slots emptied by a match", () => {
    expect(handTotal([1, null, null, 3])).toBe(4);
  });

  test("counts a 0 as nothing", () => {
    expect(handTotal([0, 0, 0, 0])).toBe(0);
  });
});

describe("isKamikaze", () => {
  test("is true for two 12s and both 13s", () => {
    expect(isKamikaze([12, 12, 13, 13])).toBe(true);
  });

  test("does not care about slot order", () => {
    expect(isKamikaze([13, 12, 13, 12])).toBe(true);
  });

  test("is false for two 12s and one 13", () => {
    expect(isKamikaze([12, 12, 13, null])).toBe(false);
  });

  test("is false for anything else", () => {
    expect(isKamikaze([12, 12, 12, 13])).toBe(false);
    expect(isKamikaze([1, 2, 3, 4])).toBe(false);
  });
});

describe("scoreRound", () => {
  test("gives the lowest hand zero and everyone else their hand", () => {
    const scores = scoreRound(
      [hand("a", [1, 2]), hand("b", [5, 5]), hand("c", [3, 3])],
      null,
    );

    expect(scores).toEqual({ a: 0, b: 10, c: 6 });
  });

  test("gives the Cabo caller zero when they are lowest", () => {
    const scores = scoreRound([hand("a", [1, 2]), hand("b", [5, 5])], "a");

    expect(scores).toEqual({ a: 0, b: 10 });
  });

  test("adds five penalty points to a Cabo caller who is not lowest", () => {
    const scores = scoreRound([hand("a", [4, 4]), hand("b", [1, 1])], "a");

    expect(scores).toEqual({ a: 13, b: 0 });
  });

  test("gives every tied player zero when none of them called Cabo", () => {
    const scores = scoreRound(
      [hand("a", [2, 2]), hand("b", [2, 2]), hand("c", [9, 9])],
      null,
    );

    expect(scores).toEqual({ a: 0, b: 0, c: 18 });
  });

  test("gives a tie to the Cabo caller, who alone scores zero", () => {
    const scores = scoreRound([hand("a", [2, 2]), hand("b", [2, 2])], "a");

    expect(scores).toEqual({ a: 0, b: 4 });
  });

  test("still penalises a caller who ties above the lowest hand", () => {
    const scores = scoreRound(
      [hand("a", [4, 4]), hand("b", [4, 4]), hand("c", [1, 1])],
      "a",
    );

    expect(scores).toEqual({ a: 13, b: 8, c: 0 });
  });

  test("gives everyone else 50 on a Kamikaze", () => {
    const scores = scoreRound(
      [hand("a", [12, 12, 13, 13]), hand("b", [1, 1]), hand("c", [2, 2])],
      null,
    );

    expect(scores).toEqual({ a: 0, b: 50, c: 50 });
  });

  test("does not penalise a Kamikaze player who called Cabo", () => {
    const scores = scoreRound(
      [hand("a", [12, 12, 13, 13]), hand("b", [1, 1])],
      "a",
    );

    expect(scores).toEqual({ a: 0, b: 50 });
  });
});
