import type { Card } from "./deck.js";

export type PlayerId = string;

export type Phase = "peeking" | "playing" | "roundOver" | "gameOver";

export type TurnStage = "acting" | "resolving";

export interface PlayerState {
  readonly id: PlayerId;
  /**
   * Fixed for the whole round: a card replaced in slot 2 stays in slot 2.
   * `null` means the slot was emptied by a successful match, so the hand has
   * shrunk to 3, 2 or 1 cards.
   */
  slots: (Card | null)[];
  /** Cumulative across rounds. The game ends when someone exceeds 100. */
  totalScore: number;
  /** Slots viewed during the peek phase. At most two per deal. */
  peeksUsed: number[];
  /** Whether the player has finished peeking and is ready to play. */
  ready: boolean;
}

export interface GameState {
  players: PlayerState[];
  /** Top of the pile is the last element. */
  drawPile: Card[];
  /** Top of the pile is the last element. */
  discardPile: Card[];
  phase: Phase;
  /** Null until the peek phase ends. */
  currentPlayerId: PlayerId | null;
  /**
   * The card the current player drew and has not yet resolved. Only ever set
   * between a `draw` and the action that disposes of it.
   */
  heldCard: Card | null;
  /**
   * `resolving` means the current player has done something that told them (or
   * the table) something — a Peek, Spy, Swap or a match — and the turn is
   * deliberately held open so they can take it in. Only `end_turn` gets out.
   */
  turnStage: TurnStage;
  /** Set once someone calls Cabo; the round ends when play returns to them. */
  caboCalledBy: PlayerId | null;
  /** Who leads the current round. */
  firstPlayerId: PlayerId;
  /** Winner of the round just scored; they lead the next one. */
  lastRoundWinnerId: PlayerId | null;
  /** Advanced on every shuffle so reshuffles stay deterministic. */
  rngState: number;
}
