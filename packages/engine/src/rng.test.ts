import { describe, expect, test } from "vitest";
import { createRng, shuffle } from "./rng.js";

describe("createRng", () => {
  test("produces the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const drawFive = (rng: () => number) => [rng(), rng(), rng(), rng(), rng()];

    expect(drawFive(a)).toEqual(drawFive(b));
  });

  test("produces a different sequence for a different seed", () => {
    expect(createRng(1)()).not.toEqual(createRng(2)());
  });

  test("produces values in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  test("returns a permutation of the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];

    expect(shuffle(input, createRng(3)).sort((a, b) => a - b)).toEqual(input);
  });

  test("does not mutate the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffle(input, createRng(3));

    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("orders identically for the same seed", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];

    expect(shuffle(input, createRng(9))).toEqual(shuffle(input, createRng(9)));
  });

  test("actually reorders", () => {
    const input = Array.from({ length: 52 }, (_, i) => i);

    expect(shuffle(input, createRng(11))).not.toEqual(input);
  });
});
