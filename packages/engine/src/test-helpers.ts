import type { Card } from "./deck.js";
import { applyAction, createGame } from "./game.js";
import type { GameState, PlayerId } from "./types.js";

/** A game past the peek phase, ready for the first turn. */
export function startedGame(
  playerIds: readonly PlayerId[] = ["a", "b"],
  seed = 1,
): GameState {
  let state = createGame({ playerIds, seed });
  for (const id of playerIds) {
    state = applyAction(state, id, { type: "ready" }).state;
  }
  return state;
}

export interface Stacked {
  /** Slots per player id. */
  hands?: Record<PlayerId, (Card | null)[]>;
  /** Draw pile, top card LAST. */
  draw?: Card[];
  /** Discard pile, top card LAST. */
  discard?: Card[];
  /** Cumulative scores carried in from earlier rounds. */
  totals?: Record<PlayerId, number>;
}

/**
 * Replace the shuffled cards with exact ones so a rule can be tested against a
 * known board. Test-only; the engine never does this.
 */
export function stack(state: GameState, cards: Stacked): GameState {
  const next = structuredClone(state);

  for (const [playerId, slots] of Object.entries(cards.hands ?? {})) {
    const player = next.players.find((each) => each.id === playerId);
    if (!player) throw new Error(`stack(): no such player ${playerId}`);
    player.slots = [...slots];
  }
  for (const [playerId, total] of Object.entries(cards.totals ?? {})) {
    const player = next.players.find((each) => each.id === playerId);
    if (!player) throw new Error(`stack(): no such player ${playerId}`);
    player.totalScore = total;
  }
  if (cards.draw) next.drawPile = [...cards.draw];
  if (cards.discard) next.discardPile = [...cards.discard];

  return next;
}
