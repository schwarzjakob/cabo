import type { Card } from "./deck.js";
import type { GameEvent } from "./events.js";
import type { GameState, Phase, PlayerId, TurnStage } from "./types.js";

/**
 * What one player is allowed to know.
 *
 * Card values are deliberately absent — not even your own. Peeked cards are
 * delivered as transient events and never stored in the view, because keeping
 * them visible would remove the memory that the whole game rests on.
 */
export interface PlayerView {
  youId: PlayerId;
  phase: Phase;
  currentPlayerId: PlayerId | null;
  /** `resolving` means the current player is taking in what they just saw. */
  turnStage: TurnStage;
  caboCalledBy: PlayerId | null;
  players: {
    id: PlayerId;
    /** True where a card still sits; false where a match emptied the slot. */
    slots: boolean[];
    totalScore: number;
    ready: boolean;
    /**
     * Which slots this player has looked at. Public on purpose: at a real
     * table everyone watches you lift a particular card.
     */
    peeksUsed: number[];
  }[];
  drawPileCount: number;
  discardTop: Card | null;
  discardCount: number;
  /** The card you drew and have not yet resolved. Null for everyone else. */
  heldCard: Card | null;
  /** So other players can see that the turn is mid-decision. */
  someoneIsHolding: boolean;
  /** Populated only once the round is scored and everyone flips. */
  revealedHands: { playerId: PlayerId; slots: (Card | null)[] }[] | null;
}

export function viewFor(state: GameState, viewerId: PlayerId): PlayerView {
  const roundIsOver = state.phase === "roundOver" || state.phase === "gameOver";

  return {
    youId: viewerId,
    phase: state.phase,
    currentPlayerId: state.currentPlayerId,
    turnStage: state.turnStage,
    caboCalledBy: state.caboCalledBy,
    players: state.players.map((player) => ({
      id: player.id,
      slots: player.slots.map((card) => card !== null),
      totalScore: player.totalScore,
      ready: player.ready,
      peeksUsed: [...player.peeksUsed],
    })),
    drawPileCount: state.drawPile.length,
    discardTop: state.discardPile[state.discardPile.length - 1] ?? null,
    discardCount: state.discardPile.length,
    heldCard: state.currentPlayerId === viewerId ? state.heldCard : null,
    someoneIsHolding: state.heldCard !== null,
    revealedHands: roundIsOver
      ? state.players.map((player) => ({
          playerId: player.id,
          slots: [...player.slots],
        }))
      : null,
  };
}

/**
 * An event as one player is allowed to receive it. Card values on `peeked`,
 * `spied` and `drew` are stripped for everyone but the player who earned the
 * look; the slot survives, so the table still sees *which* card was inspected.
 */
export type ClientEvent =
  | Exclude<GameEvent, { type: "peeked" | "spied" | "drew" }>
  | { type: "peeked"; playerId: PlayerId; slot: number; card?: Card }
  | {
      type: "spied";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      slot: number;
      card?: Card;
    }
  | { type: "drew"; playerId: PlayerId; card?: Card };

export function redactEvent(
  event: GameEvent,
  viewerId: PlayerId,
): ClientEvent {
  if (event.type === "peeked") {
    if (event.playerId === viewerId) return event;
    return { type: "peeked", playerId: event.playerId, slot: event.slot };
  }

  if (event.type === "drew") {
    if (event.playerId === viewerId) return event;
    return { type: "drew", playerId: event.playerId };
  }

  if (event.type === "spied") {
    if (event.playerId === viewerId) return event;
    return {
      type: "spied",
      playerId: event.playerId,
      targetPlayerId: event.targetPlayerId,
      slot: event.slot,
    };
  }

  return event;
}
