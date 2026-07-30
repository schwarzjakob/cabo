import type { Card, ClientEvent, PlayerId } from "@cabo/engine";
import { applyEvent, forgetScope, type RevealScope, type Reveals } from "./reveals.js";

/**
 * Everything the client is entitled to put on screen, and nothing else.
 *
 * The rule this module exists to keep: a number painted on a card must be the
 * card actually sitting there. A display that lies is worse than one that shows
 * nothing, because the player will act on it.
 */
export interface Display {
  /** Private looks, shown only while the card is held down. */
  reveals: Reveals;
  /** Cards currently face up **in a hand**, visible to the whole table. */
  handFaceUp: Record<string, Card>;
  /** Cards just traded away, now sitting on the discard pile. */
  pileFan: Card[];
}

export const emptyDisplay: Display = {
  reveals: {},
  handFaceUp: {},
  pileFan: [],
};

const keyOf = (playerId: PlayerId, slot: number) => `${playerId}:${slot}`;

export function faceUpInHand(
  display: Display,
  playerId: PlayerId,
  slot: number,
): Card | null {
  return display.handFaceUp[keyOf(playerId, slot)] ?? null;
}

export function applyClientEvent(
  display: Display,
  event: ClientEvent,
  scope: RevealScope,
  youId: PlayerId,
): Display {
  const reveals = applyEvent(display.reveals, event, scope, youId);

  switch (event.type) {
    case "match_revealed":
      // Turned over but still in the hand, so it is honest to show it there.
      return {
        ...display,
        reveals,
        handFaceUp: {
          ...display.handFaceUp,
          [keyOf(event.playerId, event.slot)]: event.card,
        },
      };

    case "match_failed":
      // They go back exactly where they were, so they stay face up in place.
      return {
        ...display,
        reveals,
        handFaceUp: {
          ...display.handFaceUp,
          ...Object.fromEntries(
            event.revealed.map((each) => [
              keyOf(event.playerId, each.slot),
              each.card,
            ]),
          ),
        },
      };

    case "match_succeeded": {
      // The traded cards have left the hand for the discard pile. Leaving them
      // painted on the slots would show a value the slot no longer holds —
      // including the slot that just took the replacement card.
      const traded = event.slots.map(
        (slot) => display.handFaceUp[keyOf(event.playerId, slot)] ?? event.matchedValue,
      );

      return {
        reveals,
        handFaceUp: withoutSlots(display.handFaceUp, event.playerId, event.slots),
        pileFan: traded,
      };
    }

    default:
      return { ...display, reveals };
  }
}

/** A turn ending clears everything public and every look it granted. */
export function onTurnChanged(display: Display): Display {
  return {
    reveals: forgetScope(display.reveals, "turn"),
    handFaceUp: {},
    pileFan: [],
  };
}

export function onPeekPhaseEnded(display: Display): Display {
  return { ...display, reveals: forgetScope(display.reveals, "peekPhase") };
}

function withoutSlots(
  faceUp: Record<string, Card>,
  playerId: PlayerId,
  slots: readonly number[],
): Record<string, Card> {
  const drop = new Set(slots.map((slot) => keyOf(playerId, slot)));
  return Object.fromEntries(
    Object.entries(faceUp).filter(([key]) => !drop.has(key)),
  );
}
