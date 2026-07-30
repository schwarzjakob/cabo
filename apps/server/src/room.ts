import { randomUUID } from "node:crypto";
import {
  applyAction,
  createGame,
  startNextRound,
  viewFor,
  redactEvent,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Action,
  type ClientEvent,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
} from "@cabo/engine";
import {
  MAX_NICKNAME_LENGTH,
  type RoomView,
  type TimerView,
} from "@cabo/protocol";

export const PEEK_SECONDS = 30;
export const TURN_SECONDS = 60;
/** Consecutive timeouts before a player is treated as away. */
export const AFK_TIMEOUTS = 3;

const CODE_LENGTH = 4;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O — they read as 1 and 0

interface Member {
  id: PlayerId;
  nickname: string;
  token: string;
  connected: boolean;
  consecutiveTimeouts: number;
}

/**
 * Called whenever the room's state changes. Events arrive raw — redaction is
 * per recipient, so the transport must run them through `eventsFor` for each
 * player rather than redacting once.
 */
export type RoomListener = (events: GameEvent[]) => void;

/**
 * One game and the people around it. Deliberately transport-free: the socket
 * layer only translates messages into these calls.
 */
export class Room {
  readonly code: string;

  private readonly members: Member[] = [];
  private game: GameState | null = null;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private timerView: TimerView | null = null;
  private listener: RoomListener = () => {};
  private roundCounter = 0;

  constructor(private readonly seed: string) {
    this.code = codeFrom(seed);
  }

  onChange(listener: RoomListener): void {
    this.listener = listener;
  }

  // — membership ————————————————————————————————————————————————

  join(nickname: string): { playerId: PlayerId; token: string } {
    const trimmed = nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
    if (trimmed.length === 0) {
      throw new Error("A nickname is required");
    }
    if (this.game !== null) {
      throw new Error("That game has already started");
    }
    if (this.members.length >= MAX_PLAYERS) {
      throw new Error("That room is full");
    }

    const member: Member = {
      id: randomUUID(),
      nickname: trimmed,
      token: randomUUID(),
      connected: true,
      consecutiveTimeouts: 0,
    };
    this.members.push(member);

    return { playerId: member.id, token: member.token };
  }

  disconnect(playerId: PlayerId): void {
    const member = this.requireMember(playerId);
    member.connected = false;
  }

  reconnect(token: string): PlayerId {
    const member = this.members.find((each) => each.token === token);
    if (!member) {
      throw new Error("Unknown reconnect token");
    }
    member.connected = true;
    return member.id;
  }

  isAway(playerId: PlayerId): boolean {
    return this.requireMember(playerId).consecutiveTimeouts >= AFK_TIMEOUTS;
  }

  get isEmpty(): boolean {
    return this.members.every((member) => !member.connected);
  }

  // — game lifecycle —————————————————————————————————————————————

  start(): void {
    if (this.game !== null) {
      throw new Error("That game has already started");
    }
    if (this.members.length < MIN_PLAYERS) {
      throw new Error(`CABO needs at least ${MIN_PLAYERS} players`);
    }

    this.game = createGame({
      playerIds: this.members.map((member) => member.id),
      seed: seedNumber(this.seed, this.roundCounter++),
    });
    this.startPeekTimer();
  }

  act(playerId: PlayerId, action: Action): void {
    const game = this.requireGame();
    // applyAction is pure, so an illegal move throws before anything is kept.
    const { state, events } = applyAction(game, playerId, action);

    this.game = state;
    this.requireMember(playerId).consecutiveTimeouts = 0;
    this.rearmTimer();
    this.listener(events);
  }

  nextRound(): void {
    const game = this.requireGame();
    this.game = startNextRound(game, seedNumber(this.seed, this.roundCounter++));
    this.startPeekTimer();
  }

  // — views ——————————————————————————————————————————————————————

  view(): RoomView {
    return {
      code: this.code,
      seats: this.members.map((member, index) => ({
        id: member.id,
        nickname: member.nickname,
        connected: member.connected,
        isHost: index === 0,
      })),
      started: this.game !== null,
    };
  }

  viewFor(playerId: PlayerId): PlayerView {
    return viewFor(this.requireGame(), playerId);
  }

  /** Redact a batch of events for one recipient. */
  eventsFor(events: readonly GameEvent[], playerId: PlayerId): ClientEvent[] {
    return events.map((event) => redactEvent(event, playerId));
  }

  get playerIds(): PlayerId[] {
    return this.members.map((member) => member.id);
  }

  get hasStarted(): boolean {
    return this.game !== null;
  }

  timer(): TimerView | null {
    return this.timerView;
  }

  // — timers —————————————————————————————————————————————————————

  private startPeekTimer(): void {
    this.setTimer("peek", null, PEEK_SECONDS, () => {
      // Anyone still peeking is marked ready, which starts play.
      const events: GameEvent[] = [];

      for (const member of this.members) {
        const player = this.game?.players.find((each) => each.id === member.id);
        if (player && !player.ready) {
          const result = applyAction(this.game!, member.id, { type: "ready" });
          this.game = result.state;
          events.push(...result.events);
        }
      }

      this.startTurnTimer();
      // Without this the phase change never reaches anyone and the table
      // simply freezes.
      this.listener(events);
    });
  }

  private startTurnTimer(): void {
    const game = this.game;
    if (!game || game.currentPlayerId === null) {
      this.clearTimer();
      return;
    }

    this.setTimer("turn", game.currentPlayerId, TURN_SECONDS, () => {
      this.playTimeoutTurn();
    });
  }

  /**
   * A turn must be one of the three legal actions, so a timeout draws and
   * immediately discards: legal, information-neutral, and it never worsens the
   * hand of the player who ran out of time.
   */
  private playTimeoutTurn(): void {
    const game = this.game;
    if (!game || game.currentPlayerId === null) return;

    const playerId = game.currentPlayerId;
    const events: GameEvent[] = [];
    let state = game;

    // The player may already be holding a card they drew before running out of
    // time — drawing a second one is illegal, so only draw when empty-handed.
    if (state.heldCard === null) {
      const drawn = applyAction(state, playerId, { type: "draw" });
      state = drawn.state;
      events.push(...drawn.events);
    }

    const discarded = applyAction(state, playerId, { type: "discard_drawn" });
    state = discarded.state;
    events.push(...discarded.events);

    this.game = state;
    this.requireMember(playerId).consecutiveTimeouts += 1;

    this.listener(events);
    this.rearmTimer();
  }

  private rearmTimer(): void {
    const game = this.game;
    if (!game) return this.clearTimer();

    if (game.phase === "peeking") return;
    if (game.phase !== "playing") return this.clearTimer();

    // The clock belongs to the turn, not to each action within it. Restarting
    // it on every draw would hand the player an unlimited think.
    const running = this.timerView;
    if (running?.kind === "turn" && running.playerId === game.currentPlayerId) {
      return;
    }
    this.startTurnTimer();
  }

  private setTimer(
    kind: TimerView["kind"],
    playerId: PlayerId | null,
    seconds: number,
    onExpiry: () => void,
  ): void {
    this.clearTimer();
    this.timerView = { kind, playerId, endsAt: Date.now() + seconds * 1000 };
    // A throw inside a timer callback is an unhandled exception that kills the
    // whole process — one room's bug must not end everyone else's game.
    this.timerHandle = setTimeout(() => {
      try {
        onExpiry();
      } catch (error) {
        console.error(`[room ${this.code}] timer failed`, error);
        this.clearTimer();
      }
    }, seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) clearTimeout(this.timerHandle);
    this.timerHandle = null;
    this.timerView = null;
  }

  // — helpers ————————————————————————————————————————————————————

  private requireGame(): GameState {
    if (this.game === null) {
      throw new Error("That game has not started yet");
    }
    return this.game;
  }

  private requireMember(playerId: PlayerId): Member {
    const member = this.members.find((each) => each.id === playerId);
    if (!member) {
      throw new Error(`No such player: ${playerId}`);
    }
    return member;
  }
}

function codeFrom(seed: string): string {
  let hash = 2166136261;
  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length) + i * 7919 + 1;
  }
  return code;
}

function seedNumber(seed: string, round: number): number {
  let hash = 2166136261 ^ round;
  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash >>> 0;
}
