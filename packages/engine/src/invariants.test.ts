import { describe, expect, test } from "vitest";
import { createDeck } from "./deck.js";
import { applyAction, createGame, startNextRound } from "./game.js";
import { createRng } from "./rng.js";
import { redactEvent, viewFor } from "./view.js";
import type { Action } from "./actions.js";
import type { GameEvent } from "./events.js";
import type { GameState, PlayerId } from "./types.js";

const DECK = [...createDeck()].sort((a, b) => a - b);

/** Every card must be somewhere, always. */
function cardsInPlay(state: GameState): number[] {
  return [
    ...state.drawPile,
    ...state.discardPile,
    ...state.players.flatMap((player) => player.slots),
    state.heldCard,
  ]
    .filter((card): card is number => card !== null && card !== undefined)
    .sort((a, b) => a - b);
}

/** A random legal-ish move for whoever is to act. */
function randomAction(state: GameState, rng: () => number): Action | null {
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(rng() * items.length)]!;

  // A turn held open for a look accepts nothing else.
  if (state.turnStage === "resolving") return { type: "end_turn" };

  const player = state.players.find(
    (each) => each.id === state.currentPlayerId,
  )!;
  const filled = player.slots
    .map((card, slot) => ({ card, slot }))
    .filter((each) => each.card !== null)
    .map((each) => each.slot);

  // A match part-way through must be finished before anything else.
  const attempt = state.matchAttempt;
  if (attempt) {
    const untouched = filled.filter((slot) => !attempt.revealed.includes(slot));
    if (attempt.revealed.length < 2 && untouched.length > 0) {
      return { type: "reveal_for_match", slot: pick(untouched) };
    }
    if (rng() < 0.4 && untouched.length > 0) {
      return { type: "reveal_for_match", slot: pick(untouched) };
    }
    return { type: "commit_match", into: attempt.revealed[0]! };
  }

  if (state.heldCard === null) {
    if (rng() < 0.08 && state.caboCalledBy === null) return { type: "call_cabo" };
    if (rng() < 0.3) return { type: "take_discard" };
    return { type: "draw" };
  }

  const roll = rng();
  // Usually a bad match, which is exactly the path worth exercising.
  if (roll < 0.15 && filled.length >= 2) {
    return { type: "reveal_for_match", slot: filled[0]! };
  }
  if (roll < 0.45 && state.heldFrom === "draw") {
    return { type: "discard_drawn" };
  }
  return {
    type: "place_drawn",
    target: { kind: "slot", slot: pick(filled) },
  };
}

interface Step {
  state: GameState;
  events: GameEvent[];
}

/** Play a whole game to its end, collecting every intermediate state. */
function playRandomGame(seed: number, playerIds: PlayerId[]): Step[] {
  const rng = createRng(seed);
  let state = createGame({ playerIds, seed });
  const steps: Step[] = [{ state, events: [] }];

  for (let guard = 0; guard < 20_000; guard++) {
    if (state.phase === "gameOver") break;

    if (state.phase === "peeking") {
      const player = state.players.find((each) => !each.ready)!;
      const action: Action =
        player.peeksUsed.length < 2
          ? { type: "peek_card", slot: player.peeksUsed.length }
          : { type: "ready" };
      const result = applyAction(state, player.id, action);
      state = result.state;
      steps.push(result);
      continue;
    }

    if (state.phase === "roundOver") {
      state = startNextRound(state, seed + guard);
      steps.push({ state, events: [] });
      continue;
    }

    const action = randomAction(state, rng);
    if (!action) break;

    try {
      const result = applyAction(state, state.currentPlayerId!, action);
      state = result.state;
      steps.push(result);
    } catch {
      // An illegal move must never corrupt state; try another.
    }
  }

  return steps;
}

describe("invariants across whole games", () => {
  const seeds = [1, 2, 3, 7, 42, 1234];

  test.each(seeds)("all 52 cards stay accounted for (seed %i)", (seed) => {
    for (const { state } of playRandomGame(seed, ["a", "b", "c"])) {
      expect(cardsInPlay(state)).toEqual(DECK);
    }
  });

  test.each(seeds)("a player's view never carries a hand's values (seed %i)", (
    seed,
  ) => {
    for (const { state } of playRandomGame(seed, ["a", "b", "c"])) {
      if (state.phase === "roundOver" || state.phase === "gameOver") continue;

      for (const viewer of ["a", "b", "c"]) {
        for (const player of viewFor(state, viewer).players) {
          for (const slot of player.slots) {
            expect(typeof slot).toBe("boolean");
          }
        }
      }
    }
  });

  test.each(seeds)("a drawn card reaches nobody but the drawer (seed %i)", (
    seed,
  ) => {
    for (const { state, events } of playRandomGame(seed, ["a", "b", "c"])) {
      for (const viewer of ["a", "b", "c"]) {
        if (viewer !== state.currentPlayerId) {
          expect(viewFor(state, viewer).heldCard).toBeNull();
        }

        for (const event of events) {
          const redacted = redactEvent(event, viewer);
          const isPrivate =
            redacted.type === "peeked" ||
            redacted.type === "spied" ||
            redacted.type === "drew";

          if (isPrivate && redacted.playerId !== viewer) {
            expect(redacted).not.toHaveProperty("card");
          }
        }
      }
    }
  });

  test.each(seeds)("nobody's score ever goes past 100 unnoticed (seed %i)", (
    seed,
  ) => {
    const steps = playRandomGame(seed, ["a", "b", "c"]);
    const final = steps[steps.length - 1]!.state;

    if (final.players.some((player) => player.totalScore > 100)) {
      expect(final.phase).toBe("gameOver");
    }
  });

  test.each(seeds)("a total of exactly 100 never survives (seed %i)", (seed) => {
    for (const { state } of playRandomGame(seed, ["a", "b", "c"])) {
      for (const player of state.players) {
        expect(player.totalScore).not.toBe(100);
      }
    }
  });

  test("games reach a conclusion rather than stalling", () => {
    const steps = playRandomGame(42, ["a", "b", "c"]);

    expect(steps[steps.length - 1]!.state.phase).toBe("gameOver");
  });
});
