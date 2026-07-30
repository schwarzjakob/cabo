import { describe, expect, test } from "vitest";
import {
  applyAction,
  createGame,
  redactEvent,
  startNextRound,
  type Action,
  type GameState,
  type PlayerId,
} from "@cabo/engine";
import {
  applyClientEvent,
  emptyDisplay,
  expireFlashes,
  faceUpInHand,
  onTurnChanged,
  FLASH_MS,
  type Display,
} from "./display.js";

const feed = (
  display: Display,
  events: Parameters<typeof applyClientEvent>[1][],
  youId: PlayerId = "me",
) =>
  events.reduce(
    (current, event) => applyClientEvent(current, event, "turn", youId),
    display,
  );

describe("cards a match turns face up", () => {
  test("shows a revealed card in the hand it is still sitting in", () => {
    const display = feed(emptyDisplay, [
      { type: "match_revealed", playerId: "me", slot: 1, card: 6 },
    ]);

    expect(faceUpInHand(display, "me", 1)).toBe(6);
  });

  test("keeps failed cards face up, because they go back where they were", () => {
    const display = feed(emptyDisplay, [
      { type: "match_revealed", playerId: "me", slot: 0, card: 3 },
      { type: "match_revealed", playerId: "me", slot: 1, card: 4 },
      {
        type: "match_failed",
        playerId: "me",
        revealed: [
          { slot: 0, card: 3 },
          { slot: 1, card: 4 },
        ],
        discarded: 9,
      },
    ]);

    expect(faceUpInHand(display, "me", 0)).toBe(3);
    expect(faceUpInHand(display, "me", 1)).toBe(4);
  });

  test("takes traded cards out of the hand — they are on the pile now", () => {
    const display = feed(emptyDisplay, [
      { type: "match_revealed", playerId: "me", slot: 0, card: 1 },
      { type: "match_revealed", playerId: "me", slot: 1, card: 1 },
      {
        type: "match_succeeded",
        playerId: "me",
        slots: [0, 1],
        into: 0,
        matchedValue: 1,
      },
    ]);

    expect(faceUpInHand(display, "me", 0)).toBeNull();
    expect(faceUpInHand(display, "me", 1)).toBeNull();
  });

  test("shows the traded cards stacked on the discard pile instead", () => {
    const display = feed(emptyDisplay, [
      { type: "match_revealed", playerId: "me", slot: 0, card: 1 },
      { type: "match_revealed", playerId: "me", slot: 1, card: 1 },
      {
        type: "match_succeeded",
        playerId: "me",
        slots: [0, 1],
        into: 0,
        matchedValue: 1,
      },
    ]);

    expect(display.pileFan).toEqual([1, 1]);
  });

  test("forgets everything once the turn moves on", () => {
    const display = onTurnChanged(
      feed(emptyDisplay, [
        { type: "match_revealed", playerId: "me", slot: 0, card: 1 },
      ]),
    );

    expect(faceUpInHand(display, "me", 0)).toBeNull();
    expect(display.pileFan).toEqual([]);
  });
});

/**
 * The invariant that matters: if the client is painting a number onto a card,
 * that number must be the card actually sitting there. A display that lies is
 * worse than one that shows nothing.
 */
describe("the client never shows a card that is not there", () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21, 42];

  const randomAction = (state: GameState, rng: () => number): Action => {
    const player = state.players.find(
      (each) => each.id === state.currentPlayerId,
    )!;
    const filled = player.slots.flatMap((card, slot) =>
      card === null ? [] : [slot],
    );
    const pick = <T>(items: readonly T[]) =>
      items[Math.floor(rng() * items.length)]!;

    if (state.turnStage === "resolving") return { type: "end_turn" };

    const attempt = state.matchAttempt;
    if (attempt) {
      const left = filled.filter((slot) => !attempt.revealed.includes(slot));
      if (attempt.revealed.length < 2 && left.length > 0) {
        return { type: "reveal_for_match", slot: pick(left) };
      }
      if (rng() < 0.35 && left.length > 0) {
        return { type: "reveal_for_match", slot: pick(left) };
      }
      return { type: "commit_match", into: attempt.revealed[0]! };
    }

    if (state.heldCard === null) {
      if (rng() < 0.07 && state.caboCalledBy === null) {
        return { type: "call_cabo" };
      }
      return rng() < 0.3 ? { type: "take_discard" } : { type: "draw" };
    }

    // Lean hard on matching — that is where the lying happened.
    if (rng() < 0.45 && filled.length >= 2) {
      return { type: "reveal_for_match", slot: pick(filled) };
    }
    if (rng() < 0.4 && state.heldFrom === "draw") {
      return { type: "discard_drawn" };
    }
    return { type: "place_drawn", target: { kind: "slot", slot: pick(filled) } };
  };

  test.each(seeds)("across a whole game (seed %i)", (seed) => {
    const ids: PlayerId[] = ["a", "b", "c"];
    let state = createGame({ playerIds: ids, seed });
    let rngState = seed;
    const rng = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    const displays = new Map<PlayerId, Display>(
      ids.map((id) => [id, emptyDisplay]),
    );
    let lastTurn = state.currentPlayerId;

    const check = () => {
      for (const id of ids) {
        const display = displays.get(id)!;
        for (const player of state.players) {
          for (let slot = 0; slot < player.slots.length; slot++) {
            const shown = faceUpInHand(display, player.id, slot);
            if (shown === null) continue;
            expect(shown).toBe(player.slots[slot]);
          }
        }
      }
    };

    for (let step = 0; step < 4000; step++) {
      if (state.phase === "gameOver") break;

      let action: Action;
      let actor: PlayerId;

      if (state.phase === "peeking") {
        const player = state.players.find((each) => !each.ready)!;
        actor = player.id;
        action =
          player.peeksUsed.length < 2
            ? { type: "peek_card", slot: player.peeksUsed.length }
            : { type: "ready" };
      } else if (state.phase === "roundOver") {
        state = startNextRound(state, seed + step);
        for (const id of ids) displays.set(id, onTurnChanged(displays.get(id)!));
        lastTurn = state.currentPlayerId;
        continue;
      } else {
        actor = state.currentPlayerId!;
        action = randomAction(state, rng);
      }

      let events;
      try {
        const result = applyAction(state, actor, action);
        state = result.state;
        events = result.events;
      } catch {
        continue;
      }

      for (const id of ids) {
        let display = displays.get(id)!;
        for (const event of events) {
          display = applyClientEvent(display, redactEvent(event, id), "turn", id);
        }
        displays.set(id, display);
      }

      // Whatever is on screen must be true of the board right now.
      check();

      if (state.currentPlayerId !== lastTurn) {
        for (const id of ids) displays.set(id, onTurnChanged(displays.get(id)!));
        lastTurn = state.currentPlayerId;
      }
    }

    expect(state.phase).toBe("gameOver");
  });
});

describe("showing what a player is doing right now", () => {
  const at = (display: Display, playerId: PlayerId, slot: number) =>
    display.flashes.find(
      (flash) => flash.playerId === playerId && flash.slot === slot,
    );

  test("flags the slot an opponent peeked at, without the value", () => {
    const display = applyClientEvent(
      emptyDisplay,
      { type: "peeked", playerId: "them", slot: 2 },
      "turn",
      "me",
      1000,
    );

    expect(at(display, "them", 2)?.kind).toBe("peek");
    expect(faceUpInHand(display, "them", 2)).toBeNull();
  });

  test("flags the card of yours that somebody spied on", () => {
    const display = applyClientEvent(
      emptyDisplay,
      { type: "spied", playerId: "them", targetPlayerId: "me", slot: 1 },
      "turn",
      "me",
      1000,
    );

    expect(at(display, "me", 1)?.kind).toBe("spy");
  });

  test("flags both sides of a swap, so everyone sees what moved", () => {
    const display = applyClientEvent(
      emptyDisplay,
      {
        type: "swapped",
        playerId: "them",
        ownSlot: 3,
        targetPlayerId: "me",
        targetSlot: 0,
      },
      "turn",
      "me",
      1000,
    );

    expect(at(display, "them", 3)?.kind).toBe("swap");
    expect(at(display, "me", 0)?.kind).toBe("swap");
  });

  test("keeps a marker up for as long as the turn is still being resolved", () => {
    // A Swap holds the turn open while the player takes it in. The rest of the
    // table must be able to see it for that whole beat, however long it lasts.
    const display = applyClientEvent(
      emptyDisplay,
      {
        type: "swapped",
        playerId: "them",
        ownSlot: 3,
        targetPlayerId: "me",
        targetSlot: 0,
      },
      "turn",
      "me",
      1000,
    );

    expect(expireFlashes(display, 1000 + FLASH_MS * 10).flashes).toHaveLength(2);
  });

  test("clears it once the turn has ended and it has been seen", () => {
    const display = onTurnChanged(
      applyClientEvent(
        emptyDisplay,
        { type: "peeked", playerId: "them", slot: 2 },
        "turn",
        "me",
        1000,
      ),
    );

    expect(expireFlashes(display, 1000 + FLASH_MS + 1).flashes).toEqual([]);
  });

  test("holds a marker from a turn that ended instantly, so it is still seen", () => {
    // Replacing a card ends the turn at once; without a floor the marker would
    // be gone before anyone could look at it.
    const display = onTurnChanged(
      applyClientEvent(
        emptyDisplay,
        { type: "placed", playerId: "them", slot: 2, replaced: 9 },
        "turn",
        "me",
        1000,
      ),
    );

    expect(expireFlashes(display, 1500).flashes).toHaveLength(1);
    expect(expireFlashes(display, 1000 + FLASH_MS + 1).flashes).toEqual([]);
  });
});

describe("showing cards move around the table", () => {
  const at = (display: Display, playerId: PlayerId, slot: number) =>
    display.flashes.find(
      (flash) => flash.playerId === playerId && flash.slot === slot,
    );

  test("flags the slot a replaced card went into", () => {
    const display = applyClientEvent(
      emptyDisplay,
      { type: "placed", playerId: "them", slot: 2, replaced: 9 },
      "turn",
      "me",
      1000,
    );

    expect(at(display, "them", 2)?.kind).toBe("replace");
  });

  test("never leaks the new card's value with the marker", () => {
    const display = applyClientEvent(
      emptyDisplay,
      { type: "placed", playerId: "them", slot: 2, replaced: 9 },
      "turn",
      "me",
      1000,
    );

    expect(faceUpInHand(display, "them", 2)).toBeNull();
  });

  test("flags every slot a completed trade emptied or filled", () => {
    const display = applyClientEvent(
      emptyDisplay,
      {
        type: "match_succeeded",
        playerId: "them",
        slots: [0, 3],
        into: 3,
        matchedValue: 5,
      },
      "turn",
      "me",
      1000,
    );

    expect(at(display, "them", 0)?.kind).toBe("replace");
    expect(at(display, "them", 3)?.kind).toBe("replace");
  });
});

describe("markers outlive the turn that caused them", () => {
  test("a replace still shows after the turn has passed on", () => {
    // Replacing a card ends your turn at once, so a marker cleared by the turn
    // change would be destroyed in the same update it arrived in.
    const flashed = applyClientEvent(
      emptyDisplay,
      { type: "placed", playerId: "them", slot: 2, replaced: 9 },
      "turn",
      "me",
      1000,
    );

    expect(onTurnChanged(flashed).flashes).toHaveLength(1);
  });

  test("but the looks that turn granted are still forgotten", () => {
    const looked = applyClientEvent(
      emptyDisplay,
      { type: "peeked", playerId: "me", slot: 0, card: 7 },
      "turn",
      "me",
      1000,
    );

    expect(onTurnChanged(looked).reveals).toEqual({});
  });
});
