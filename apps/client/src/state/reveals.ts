import type { Card, ClientEvent, PlayerId } from "@cabo/engine";

/**
 * How long a look stays valid. Peek-phase looks last until play begins; a
 * power's look lasts only for the turn that earned it. Nothing is kept beyond
 * its entitlement — holding a card down shows it only while you are still
 * allowed to see it, which is what keeps this a memory game rather than a
 * spreadsheet.
 */
export type RevealScope = "peekPhase" | "turn";

export type Reveals = Record<string, { card: Card; scope: RevealScope }>;

const keyOf = (playerId: PlayerId, slot: number) => `${playerId}:${slot}`;

export function revealed(
  reveals: Reveals,
  playerId: PlayerId,
  slot: number,
): Card | null {
  return reveals[keyOf(playerId, slot)]?.card ?? null;
}

export function forgetScope(reveals: Reveals, scope: RevealScope): Reveals {
  return Object.fromEntries(
    Object.entries(reveals).filter(([, value]) => value.scope !== scope),
  );
}

/** Fold one event into what this client knows. */
export function applyEvent(
  reveals: Reveals,
  event: ClientEvent,
  scope: RevealScope,
  youId: PlayerId,
): Reveals {
  switch (event.type) {
    case "peeked":
      if (event.card === undefined) return reveals;
      return remember(reveals, event.playerId, event.slot, event.card, scope);

    case "spied":
      if (event.card === undefined || event.playerId !== youId) return reveals;
      return remember(
        reveals,
        event.targetPlayerId,
        event.slot,
        event.card,
        scope,
      );

    case "placed":
      return forget(reveals, [keyOf(event.playerId, event.slot)]);

    case "swapped":
      // Deliberately not deducing that your old card is now in their slot —
      // that inference is the player's to make, not the client's.
      return forget(reveals, [
        keyOf(event.playerId, event.ownSlot),
        keyOf(event.targetPlayerId, event.targetSlot),
      ]);

    case "match_succeeded":
      return forget(
        reveals,
        event.slots.map((slot) => keyOf(event.playerId, slot)),
      );

    case "round_scored":
      return {};

    default:
      return reveals;
  }
}

function remember(
  reveals: Reveals,
  playerId: PlayerId,
  slot: number,
  card: Card,
  scope: RevealScope,
): Reveals {
  return { ...reveals, [keyOf(playerId, slot)]: { card, scope } };
}

function forget(reveals: Reveals, keys: readonly string[]): Reveals {
  return Object.fromEntries(
    Object.entries(reveals).filter(([key]) => !keys.includes(key)),
  );
}
