/** A card is just its point value. There are no suits in CABO. */
export type Card = number;

/**
 * The action printed on a choice card. A power is only ever available on a card
 * taken from the draw pile, and using it is optional.
 */
export type Power = "peek" | "spy" | "swap";

export function powerOf(card: Card): Power | null {
  if (card === 7 || card === 8) return "peek";
  if (card === 9 || card === 10) return "spy";
  if (card === 11 || card === 12) return "swap";
  return null;
}

/**
 * The official CABO deck: 1-12 four times each, plus 0 and 13 twice each.
 * Returned in canonical order; callers shuffle.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let value = 1; value <= 12; value++) {
    deck.push(value, value, value, value);
  }
  deck.push(0, 0, 13, 13);
  return deck;
}
