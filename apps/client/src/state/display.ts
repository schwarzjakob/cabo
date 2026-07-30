import type { Card, ClientEvent, PlayerId } from "@cabo/engine";
import { applyEvent, forgetScope, type RevealScope, type Reveals } from "./reveals.js";

/**
 * Everything the client is entitled to put on screen, and nothing else.
 *
 * The rule this module exists to keep: a number painted on a card must be the
 * card actually sitting there. A display that lies is worse than one that shows
 * nothing, because the player will act on it.
 */
/**
 * The shortest a marker stays on screen once its turn is over. A marker lives
 * until *both* the turn that caused it has ended and this long has passed —
 * a Swap holds the turn open while the player takes it in, and the rest of the
 * table needs to see it for that whole beat, however long it runs.
 */
export const FLASH_MS = 2600;

/**
 * A momentary marker on a slot: somebody looked at it, or swapped it. Never
 * carries a value — at a real table you see the hand move, not the card.
 */
export interface Flash {
  playerId: PlayerId;
  slot: number;
  kind: "peek" | "spy" | "swap" | "replace";
  at: number;
  /** Set when the turn that caused this ends; only then can it start fading. */
  turnEnded: boolean;
}

export interface Display {
  /** Private looks, shown only while the card is held down. */
  reveals: Reveals;
  /** Cards currently face up **in a hand**, visible to the whole table. */
  handFaceUp: Record<string, Card>;
  /** Cards just traded away, now sitting on the discard pile. */
  pileFan: Card[];
  /** Momentary "this just happened" markers. */
  flashes: Flash[];
}

export const emptyDisplay: Display = {
  reveals: {},
  handFaceUp: {},
  pileFan: [],
  flashes: [],
};

export function expireFlashes(display: Display, now: number): Display {
  const fresh = display.flashes.filter(
    (flash) => !flash.turnEnded || now - flash.at < FLASH_MS,
  );
  return fresh.length === display.flashes.length
    ? display
    : { ...display, flashes: fresh };
}

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
  now: number = Date.now(),
): Display {
  const reveals = applyEvent(display.reveals, event, scope, youId);
  const flashes = [...display.flashes, ...flashesFor(event, now)];
  display = { ...display, flashes };

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
        flashes: display.flashes,
      };
    }

    default:
      return { ...display, reveals };
  }
}

/**
 * What the table gets to see happen. Positions only — everyone watches you lift
 * a card, nobody gets to read it over your shoulder.
 */
function flashesFor(event: ClientEvent, now: number): Flash[] {
  switch (event.type) {
    case "peeked":
      return [{ playerId: event.playerId, slot: event.slot, kind: "peek", at: now, turnEnded: false }];

    case "spied":
      return [
        {
          playerId: event.targetPlayerId,
          slot: event.slot,
          kind: "spy",
          at: now,
          turnEnded: false,
        },
      ];

    case "placed":
      // Everyone must see which position changed, even though only the player
      // who put the card there knows what it is.
      return [
        {
          playerId: event.playerId,
          slot: event.slot,
          kind: "replace",
          at: now,
          turnEnded: false,
        },
      ];

    case "match_succeeded":
      return event.slots.map((slot) => ({
        playerId: event.playerId,
        slot,
        kind: "replace" as const,
        at: now,
        turnEnded: false,
      }));

    case "swapped":
      return [
        {
          playerId: event.playerId,
          slot: event.ownSlot,
          kind: "swap",
          at: now,
          turnEnded: false,
        },
        {
          playerId: event.targetPlayerId,
          slot: event.targetSlot,
          kind: "swap",
          at: now,
          turnEnded: false,
        },
      ];

    default:
      return [];
  }
}

/** A turn ending clears everything public and every look it granted. */
export function onTurnChanged(display: Display): Display {
  return {
    reveals: forgetScope(display.reveals, "turn"),
    handFaceUp: {},
    pileFan: [],
    // Markers survive the turn change and only start fading now: a replacement
    // ends the turn the instant it happens, so clearing them here would destroy
    // the marker in the same update that created it.
    flashes: display.flashes.map((flash) => ({ ...flash, turnEnded: true })),
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
