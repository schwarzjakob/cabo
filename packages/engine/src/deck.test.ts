import { describe, expect, test } from "vitest";
import { createDeck } from "./deck.js";

describe("createDeck", () => {
  test("has 52 cards", () => {
    expect(createDeck()).toHaveLength(52);
  });

  test("has four of each card from 1 to 12", () => {
    const deck = createDeck();
    for (let value = 1; value <= 12; value++) {
      expect(deck.filter((card) => card === value)).toHaveLength(4);
    }
  });

  test("has two 0s and two 13s", () => {
    const deck = createDeck();
    expect(deck.filter((card) => card === 0)).toHaveLength(2);
    expect(deck.filter((card) => card === 13)).toHaveLength(2);
  });
});
