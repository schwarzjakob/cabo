import type { PlayerId } from "./types.js";

/** Where a card being put into a hand should go. */
export type Placement =
  | { kind: "slot"; slot: number }
  /**
   * Trade a 2-, 3- or 4-of-a-kind for this single card. `into` says which of
   * the matched slots keeps it; the rest are emptied.
   */
  | { kind: "match"; slots: readonly number[]; into: number };

/** What a choice card's action is aimed at. */
export type PowerTarget =
  | { kind: "peek"; slot: number }
  | { kind: "spy"; playerId: PlayerId; slot: number }
  | {
      kind: "swap";
      ownSlot: number;
      playerId: PlayerId;
      theirSlot: number;
    };

/** Everything a player can ask the engine to do. */
export type Action =
  | { type: "peek_card"; slot: number }
  | { type: "ready" }
  | { type: "draw" }
  | { type: "place_drawn"; target: Placement }
  | { type: "discard_drawn" }
  | { type: "take_discard"; target: Placement }
  | { type: "use_power"; target: PowerTarget }
  | { type: "call_cabo" }
  /** Finish a turn that was held open so you could look at something. */
  | { type: "end_turn" };

/** Thrown when a player attempts something the rules do not allow. */
export class IllegalMove extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalMove";
  }
}
