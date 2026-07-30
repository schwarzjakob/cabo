import type { Card } from "./deck.js";
import type { PlayerId } from "./types.js";

/**
 * Everything the engine did, in order. The server redacts these per player
 * before sending them on — an event carrying a card value is not automatically
 * public.
 */
export type GameEvent =
  | { type: "peeked"; playerId: PlayerId; slot: number; card: Card }
  | { type: "play_started"; currentPlayerId: PlayerId }
  | { type: "drew"; playerId: PlayerId; card: Card }
  | { type: "took_discard"; playerId: PlayerId; card: Card }
  | { type: "placed"; playerId: PlayerId; slot: number; replaced: Card }
  | { type: "discarded"; playerId: PlayerId; card: Card }
  | { type: "turn_started"; playerId: PlayerId }
  | {
      type: "spied";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      slot: number;
      card: Card;
    }
  | {
      type: "match_succeeded";
      playerId: PlayerId;
      slots: number[];
      into: number;
      /** Public: the matched cards land face up on the discard pile. */
      matchedValue: Card;
    }
  | {
      type: "match_failed";
      playerId: PlayerId;
      /** Public: a failed match is shown to everyone at the table. */
      revealed: { slot: number; card: Card }[];
      discarded: Card;
    }
  | {
      type: "swapped";
      playerId: PlayerId;
      ownSlot: number;
      targetPlayerId: PlayerId;
      targetSlot: number;
    }
  | { type: "cabo_called"; playerId: PlayerId }
  | { type: "draw_pile_reshuffled"; cards: number }
  | {
      type: "round_scored";
      /** Public: at the end of a round everyone flips their cards. */
      hands: { playerId: PlayerId; slots: (Card | null)[] }[];
      scores: Record<PlayerId, number>;
      totals: Record<PlayerId, number>;
      winnerId: PlayerId;
    }
  | { type: "game_over"; winnerId: PlayerId; totals: Record<PlayerId, number> };
