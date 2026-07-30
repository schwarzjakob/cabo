import {
  IllegalMove,
  type Action,
  type Placement,
  type PowerTarget,
} from "./actions.js";
import { createDeck, powerOf, type Card } from "./deck.js";
import type { GameEvent } from "./events.js";
import { createRng, nextSeed, shuffle } from "./rng.js";
import { applyExactlyRule, roundWinner, scoreRound } from "./scoring.js";
import type { GameState, PlayerId, PlayerState } from "./types.js";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const CARDS_PER_PLAYER = 4;

export interface CreateGameOptions {
  playerIds: readonly PlayerId[];
  seed: number;
}

export function createGame({ playerIds, seed }: CreateGameOptions): GameState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new Error(`CABO is played by 2 to 5 players, got ${playerIds.length}`);
  }

  const deck = shuffle(createDeck(), createRng(seed));

  const players = playerIds.map((id, index) => ({
    id,
    slots: deck.slice(index * CARDS_PER_PLAYER, (index + 1) * CARDS_PER_PLAYER),
    totalScore: 0,
    peeksUsed: [],
    ready: false,
  }));

  const rest = deck.slice(playerIds.length * CARDS_PER_PLAYER);
  const firstDiscard = rest[rest.length - 1]!;

  return {
    players,
    drawPile: rest.slice(0, -1),
    discardPile: [firstDiscard],
    phase: "peeking",
    currentPlayerId: null,
    heldCard: null,
    caboCalledBy: null,
    firstPlayerId: players[0]!.id,
    lastRoundWinnerId: null,
    rngState: nextSeed(seed),
  };
}

/**
 * Deal the next round. The winner of the previous round leads, and cumulative
 * scores carry over.
 */
export function startNextRound(state: GameState, seed: number): GameState {
  if (state.phase !== "roundOver") {
    throw new IllegalMove("The round is not over yet");
  }

  const dealt = createGame({
    playerIds: state.players.map((player) => player.id),
    seed,
  });

  for (const player of dealt.players) {
    player.totalScore = state.players.find(
      (each) => each.id === player.id,
    )!.totalScore;
  }

  dealt.firstPlayerId = state.lastRoundWinnerId ?? state.firstPlayerId;
  return dealt;
}

export const PEEKS_PER_DEAL = 2;

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
): ActionResult {
  const next = structuredClone(state);
  const player = requirePlayer(next, playerId);
  const events: GameEvent[] = [];

  if (next.phase === "peeking") {
    applyPeekPhaseAction(next, player, action, events);
    return { state: next, events };
  }

  if (next.phase === "playing") {
    applyPlayingAction(next, player, action, events);
    return { state: next, events };
  }

  throw new IllegalMove(`Cannot ${action.type} during the ${next.phase} phase`);
}

function applyPlayingAction(
  state: GameState,
  player: PlayerState,
  action: Action,
  events: GameEvent[],
): void {
  if (state.currentPlayerId !== player.id) {
    throw new IllegalMove("It is not your turn");
  }

  switch (action.type) {
    case "draw": {
      requireEmptyHand(state);
      const card = takeFromDrawPile(state, events);
      state.heldCard = card;
      events.push({ type: "drew", playerId: player.id, card });
      return;
    }

    case "place_drawn": {
      const card = requireHeldCard(state);
      state.heldCard = null;
      place(state, player, card, action.target, events);
      endTurn(state, events);
      return;
    }

    case "discard_drawn": {
      const card = requireHeldCard(state);
      state.heldCard = null;
      state.discardPile.push(card);
      events.push({ type: "discarded", playerId: player.id, card });
      endTurn(state, events);
      return;
    }

    case "take_discard": {
      requireEmptyHand(state);
      const card = state.discardPile.pop()!;
      events.push({ type: "took_discard", playerId: player.id, card });
      place(state, player, card, action.target, events);
      endTurn(state, events);
      return;
    }

    case "call_cabo": {
      requireEmptyHand(state);
      if (state.caboCalledBy !== null) {
        throw new IllegalMove(`Cabo was already called by ${state.caboCalledBy}`);
      }
      state.caboCalledBy = player.id;
      events.push({ type: "cabo_called", playerId: player.id });
      endTurn(state, events);
      return;
    }

    case "use_power": {
      const card = requireHeldCard(state);
      usePower(state, player, card, action.target, events);
      state.heldCard = null;
      state.discardPile.push(card);
      events.push({ type: "discarded", playerId: player.id, card });
      endTurn(state, events);
      return;
    }

    default:
      throw new IllegalMove(`Cannot ${action.type} during play`);
  }
}

function usePower(
  state: GameState,
  player: PlayerState,
  card: Card,
  target: PowerTarget,
  events: GameEvent[],
): void {
  const power = powerOf(card);
  if (power === null) {
    throw new IllegalMove(`A ${card} has no power`);
  }
  if (power !== target.kind) {
    throw new IllegalMove(`A ${card} does not have the ${target.kind} power`);
  }

  switch (target.kind) {
    case "peek": {
      const value = requireCardAt(player, target.slot);
      events.push({
        type: "peeked",
        playerId: player.id,
        slot: target.slot,
        card: value,
      });
      return;
    }

    case "spy": {
      const other = requireOtherPlayer(state, player, target.playerId);
      const value = requireCardAt(other, target.slot);
      events.push({
        type: "spied",
        playerId: player.id,
        targetPlayerId: other.id,
        slot: target.slot,
        card: value,
      });
      return;
    }

    case "swap": {
      const other = requireOtherPlayer(state, player, target.playerId);
      const mine = requireCardAt(player, target.ownSlot);
      const theirs = requireCardAt(other, target.theirSlot);

      player.slots[target.ownSlot] = theirs;
      other.slots[target.theirSlot] = mine;

      events.push({
        type: "swapped",
        playerId: player.id,
        ownSlot: target.ownSlot,
        targetPlayerId: other.id,
        targetSlot: target.theirSlot,
      });
      return;
    }
  }
}

function requireOtherPlayer(
  state: GameState,
  actor: PlayerState,
  targetId: PlayerId,
): PlayerState {
  if (targetId === actor.id) {
    throw new IllegalMove("This power must target another player");
  }
  return requirePlayer(state, targetId);
}

function requireCardAt(player: PlayerState, slot: number): Card {
  if (slot < 0 || slot >= player.slots.length) {
    throw new IllegalMove(`No such slot: ${slot}`);
  }
  const card = player.slots[slot];
  if (card === null || card === undefined) {
    throw new IllegalMove(`Slot ${slot} is empty`);
  }
  return card;
}

/** Put `card` into the player's hand, discarding whatever it replaced. */
function place(
  state: GameState,
  player: PlayerState,
  card: Card,
  target: Placement,
  events: GameEvent[],
): void {
  if (target.kind === "match") {
    placeAsMatch(state, player, card, target.slots, target.into, events);
    return;
  }

  const { slot } = target;
  const replaced = requireCardAt(player, slot);

  player.slots[slot] = card;
  state.discardPile.push(replaced);
  events.push({ type: "placed", playerId: player.id, slot, replaced });
}

/**
 * A 2-, 3- or 4-of-a-kind traded for one card. If the cards do not actually
 * match, the attempt is public: everyone sees them, they go back where they
 * were, the replacement is discarded and the turn is lost.
 */
function placeAsMatch(
  state: GameState,
  player: PlayerState,
  card: Card,
  slots: readonly number[],
  into: number,
  events: GameEvent[],
): void {
  if (slots.length < 2) {
    throw new IllegalMove("A match needs at least two cards");
  }
  if (new Set(slots).size !== slots.length) {
    throw new IllegalMove("A match cannot list the same slot twice");
  }
  if (!slots.includes(into)) {
    throw new IllegalMove(
      "The replacement must go into one of the matched slots",
    );
  }

  const attempted = slots.map((slot) => ({
    slot,
    card: requireCardAt(player, slot),
  }));

  const matchedValue = attempted[0]!.card;
  const isMatch = attempted.every((each) => each.card === matchedValue);

  if (!isMatch) {
    state.discardPile.push(card);
    events.push({
      type: "match_failed",
      playerId: player.id,
      revealed: attempted,
      discarded: card,
    });
    return;
  }

  for (const { slot, card: matched } of attempted) {
    player.slots[slot] = null;
    state.discardPile.push(matched);
  }
  player.slots[into] = card;

  events.push({
    type: "match_succeeded",
    playerId: player.id,
    slots: [...slots],
    into,
    matchedValue,
  });
}

/**
 * Take the top of the draw pile, reshuffling the discard pile into a new draw
 * pile when it runs out. The face-up top discard is set aside, not shuffled in.
 */
function takeFromDrawPile(state: GameState, events: GameEvent[]): Card {
  if (state.drawPile.length === 0) {
    const faceUp = state.discardPile.pop();
    if (faceUp === undefined) {
      throw new IllegalMove("There are no cards left to draw");
    }

    state.drawPile = shuffle(state.discardPile, createRng(state.rngState));
    state.rngState = nextSeed(state.rngState);
    state.discardPile = [faceUp];
    events.push({
      type: "draw_pile_reshuffled",
      cards: state.drawPile.length,
    });
  }

  return state.drawPile.pop()!;
}

function requireHeldCard(state: GameState): Card {
  if (state.heldCard === null) {
    throw new IllegalMove("You are not holding a drawn card");
  }
  return state.heldCard;
}

function requireEmptyHand(state: GameState): void {
  if (state.heldCard !== null) {
    throw new IllegalMove("You are already holding a drawn card");
  }
}

function endTurn(state: GameState, events: GameEvent[]): void {
  const index = state.players.findIndex(
    (each) => each.id === state.currentPlayerId,
  );
  const next = state.players[(index + 1) % state.players.length]!;

  // Everyone but the caller gets one more turn, so the round ends the moment
  // play would come back round to them.
  if (state.caboCalledBy !== null && next.id === state.caboCalledBy) {
    endRound(state, events);
    return;
  }

  state.currentPlayerId = next.id;
  events.push({ type: "turn_started", playerId: next.id });
}

function endRound(state: GameState, events: GameEvent[]): void {
  const scores = scoreRound(state.players, state.caboCalledBy);
  const winnerId = roundWinner(state.players, state.caboCalledBy);

  for (const player of state.players) {
    player.totalScore = applyExactlyRule(
      player.totalScore + scores[player.id]!,
    );
  }

  const totals = Object.fromEntries(
    state.players.map((player) => [player.id, player.totalScore]),
  );

  state.phase = "roundOver";
  state.currentPlayerId = null;
  state.lastRoundWinnerId = winnerId;

  events.push({
    type: "round_scored",
    hands: state.players.map((player) => ({
      playerId: player.id,
      slots: [...player.slots],
    })),
    scores,
    totals,
    winnerId,
  });

  const bust = state.players.some((player) => player.totalScore > 100);
  if (bust) {
    state.phase = "gameOver";
    const champion = state.players.reduce((best, each) =>
      each.totalScore < best.totalScore ? each : best,
    );
    events.push({ type: "game_over", winnerId: champion.id, totals });
  }
}

function applyPeekPhaseAction(
  state: GameState,
  player: PlayerState,
  action: Action,
  events: GameEvent[],
): void {
  switch (action.type) {
    case "peek_card": {
      if (player.ready) {
        throw new IllegalMove("Cannot peek after declaring ready");
      }
      if (action.slot < 0 || action.slot >= player.slots.length) {
        throw new IllegalMove(`No such slot: ${action.slot}`);
      }
      if (player.peeksUsed.includes(action.slot)) {
        throw new IllegalMove(`Slot ${action.slot} was already peeked`);
      }
      if (player.peeksUsed.length >= PEEKS_PER_DEAL) {
        throw new IllegalMove("Only two cards may be peeked after each deal");
      }

      player.peeksUsed.push(action.slot);
      events.push({
        type: "peeked",
        playerId: player.id,
        slot: action.slot,
        card: player.slots[action.slot]!,
      });
      return;
    }

    case "ready": {
      player.ready = true;
      if (state.players.every((each) => each.ready)) {
        state.phase = "playing";
        state.currentPlayerId = state.firstPlayerId;
        events.push({
          type: "play_started",
          currentPlayerId: state.currentPlayerId,
        });
      }
      return;
    }

    default:
      throw new IllegalMove(
        `Cannot ${action.type} until the peek phase is over`,
      );
  }
}

function requirePlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players.find((each) => each.id === playerId);
  if (!player) {
    throw new IllegalMove(`No such player: ${playerId}`);
  }
  return player;
}
