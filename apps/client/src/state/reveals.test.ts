import { describe, expect, test } from "vitest";
import { applyEvent, forgetScope, revealed, type Reveals } from "./reveals.js";
import type { ClientEvent } from "@cabo/engine";

const empty: Reveals = {};

describe("remembering what you were shown", () => {
  test("keeps a card you peeked at", () => {
    const event: ClientEvent = { type: "peeked", playerId: "me", slot: 1, card: 9 };

    expect(revealed(applyEvent(empty, event, "peekPhase", "me"), "me", 1)).toBe(9);
  });

  test("keeps a card you spied, filed under its owner's slot", () => {
    const event: ClientEvent = {
      type: "spied",
      playerId: "me",
      targetPlayerId: "them",
      slot: 2,
      card: 4,
    };

    expect(revealed(applyEvent(empty, event, "turn", "me"), "them", 2)).toBe(4);
  });

  test("learns nothing from an event that was redacted", () => {
    const event: ClientEvent = { type: "peeked", playerId: "them", slot: 1 };

    expect(revealed(applyEvent(empty, event, "peekPhase", "me"), "them", 1)).toBeNull();
  });

  test("knows nothing about a slot it was never shown", () => {
    expect(revealed(empty, "them", 0)).toBeNull();
  });
});

describe("forgetting what is no longer true", () => {
  const knowing = (): Reveals =>
    applyEvent(
      applyEvent(empty, { type: "peeked", playerId: "me", slot: 0, card: 9 }, "peekPhase", "me"),
      { type: "peeked", playerId: "me", slot: 1, card: 3 },
      "peekPhase",
      "me",
    );

  test("forgets a slot whose card was replaced", () => {
    const after = applyEvent(
      knowing(),
      { type: "placed", playerId: "me", slot: 0, replaced: 9 },
      "turn",
      "me",
    );

    expect(revealed(after, "me", 0)).toBeNull();
    expect(revealed(after, "me", 1)).toBe(3);
  });

  test("forgets both sides of a swap rather than deducing for you", () => {
    const after = applyEvent(
      knowing(),
      {
        type: "swapped",
        playerId: "them",
        ownSlot: 2,
        targetPlayerId: "me",
        targetSlot: 1,
      },
      "turn",
      "me",
    );

    expect(revealed(after, "me", 1)).toBeNull();
    expect(revealed(after, "them", 2)).toBeNull();
  });

  test("forgets slots emptied by a successful match", () => {
    const after = applyEvent(
      knowing(),
      {
        type: "match_succeeded",
        playerId: "me",
        slots: [0, 1],
        into: 0,
        matchedValue: 9,
      },
      "turn",
      "me",
    );

    expect(revealed(after, "me", 0)).toBeNull();
    expect(revealed(after, "me", 1)).toBeNull();
  });

  test("forgets everything when a new round is dealt", () => {
    const after = applyEvent(
      knowing(),
      {
        type: "round_scored",
        hands: [],
        scores: {},
        totals: {},
        winnerId: "me",
      },
      "turn",
      "me",
    );

    expect(after).toEqual({});
  });
});

describe("scopes", () => {
  const mixed = (): Reveals =>
    applyEvent(
      applyEvent(empty, { type: "peeked", playerId: "me", slot: 0, card: 9 }, "peekPhase", "me"),
      { type: "spied", playerId: "me", targetPlayerId: "them", slot: 3, card: 5 },
      "turn",
      "me",
    );

  test("drops turn-scoped looks at the end of a turn, keeping the opening peeks", () => {
    const after = forgetScope(mixed(), "turn");

    expect(revealed(after, "me", 0)).toBe(9);
    expect(revealed(after, "them", 3)).toBeNull();
  });

  test("drops the opening peeks when the peek phase closes", () => {
    const after = forgetScope(mixed(), "peekPhase");

    expect(revealed(after, "me", 0)).toBeNull();
    expect(revealed(after, "them", 3)).toBe(5);
  });
});
