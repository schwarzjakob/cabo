import type { Card } from "./deck.js";
import type { PlayerId } from "./types.js";

export const CABO_PENALTY = 5;
export const KAMIKAZE_PENALTY = 50;

export const EXACTLY = 100;
export const EXACTLY_DROPS_TO = 50;

export interface ScorableHand {
  id: PlayerId;
  slots: readonly (Card | null)[];
}

export interface RankableHand extends ScorableHand {
  /** Cumulative score before this round, used to break an uncalled tie. */
  totalScore: number;
}

export function handTotal(slots: readonly (Card | null)[]): number {
  return slots.reduce<number>((total, card) => total + (card ?? 0), 0);
}

/** Ending a round holding two 12s and both 13s. */
export function isKamikaze(slots: readonly (Card | null)[]): boolean {
  const cards = slots.filter((card): card is Card => card !== null);
  if (cards.length !== 4) return false;

  const count = (value: Card) => cards.filter((card) => card === value).length;
  return count(12) === 2 && count(13) === 2;
}

/**
 * Points each player gains this round. The winner scores 0 and everyone else
 * scores their hand; a Cabo caller who is not lowest takes +5 on top. Ties go
 * to the Cabo caller, and if no tied player called Cabo they all score 0.
 */
export function scoreRound(
  hands: readonly ScorableHand[],
  caboCalledBy: PlayerId | null,
): Record<PlayerId, number> {
  const kamikaze = hands.find((each) => isKamikaze(each.slots));
  if (kamikaze) {
    return Object.fromEntries(
      hands.map((each) => [
        each.id,
        each.id === kamikaze.id ? 0 : KAMIKAZE_PENALTY,
      ]),
    );
  }

  const totals = new Map(hands.map((each) => [each.id, handTotal(each.slots)]));
  const lowest = Math.min(...totals.values());
  const tied = hands.filter((each) => totals.get(each.id) === lowest);

  const callerTied = tied.some((each) => each.id === caboCalledBy);
  const winners = new Set(
    callerTied ? [caboCalledBy!] : tied.map((each) => each.id),
  );

  return Object.fromEntries(
    hands.map((each) => {
      if (winners.has(each.id)) return [each.id, 0];

      const penalty = each.id === caboCalledBy ? CABO_PENALTY : 0;
      return [each.id, totals.get(each.id)! + penalty];
    }),
  );
}

/**
 * Who won the round, and therefore leads the next one. A tie goes to the Cabo
 * caller; an uncalled tie goes to the tied player with the lowest total.
 */
export function roundWinner(
  hands: readonly RankableHand[],
  caboCalledBy: PlayerId | null,
): PlayerId {
  const kamikaze = hands.find((each) => isKamikaze(each.slots));
  if (kamikaze) return kamikaze.id;

  const totals = new Map(hands.map((each) => [each.id, handTotal(each.slots)]));
  const lowest = Math.min(...totals.values());
  const tied = hands.filter((each) => totals.get(each.id) === lowest);

  const caller = tied.find((each) => each.id === caboCalledBy);
  if (caller) return caller.id;

  return tied.reduce((best, each) =>
    each.totalScore < best.totalScore ? each : best,
  ).id;
}

/** A total of exactly 100 drops to 50. */
export function applyExactlyRule(total: number): number {
  return total === EXACTLY ? EXACTLY_DROPS_TO : total;
}
