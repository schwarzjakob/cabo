import type { Action, ClientEvent, PlayerId, PlayerView } from "@cabo/engine";

export const MAX_NICKNAME_LENGTH = 16;

/** A seat in a room, whether or not the game has started. */
export interface Seat {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  isHost: boolean;
}

/** The lobby-level state of a room, safe for everyone to see. */
export interface RoomView {
  code: string;
  seats: Seat[];
  started: boolean;
}

/** A running countdown, as an absolute deadline so clients can render it. */
export interface TimerView {
  kind: "peek" | "turn";
  endsAt: number;
  /** Whose clock it is; null during the shared peek phase. */
  playerId: PlayerId | null;
}

export type ClientMessage =
  | { type: "create_room"; nickname: string }
  | { type: "join_room"; code: string; nickname: string }
  | { type: "reconnect"; token: string }
  | { type: "start_game" }
  | { type: "action"; action: Action }
  | { type: "next_round" };

export type ServerMessage =
  /** Sent once on join; the token is how a dropped player gets back in. */
  | { type: "welcome"; roomCode: string; playerId: PlayerId; token: string }
  | { type: "room"; room: RoomView }
  | { type: "state"; view: PlayerView; timer: TimerView | null }
  | { type: "events"; events: ClientEvent[] }
  | { type: "error"; message: string };
