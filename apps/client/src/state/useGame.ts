import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, PlayerId, PlayerView } from "@cabo/engine";
import type { RoomView, TimerView } from "@cabo/protocol";
import { Connection } from "../net/connection.js";
import { revealed } from "./reveals.js";
import {
  applyClientEvent,
  emptyDisplay,
  expireFlashes,
  faceUpInHand,
  onPeekPhaseEnded,
  onTurnChanged,
  type Display,
} from "./display.js";

const TOKEN_KEY = "cabo.token";

export interface Game {
  connected: boolean;
  error: string | null;
  youId: PlayerId | null;
  room: RoomView | null;
  view: PlayerView | null;
  timer: TimerView | null;
  /** What this client is currently entitled to see, by player and slot. */
  cardAt: (playerId: PlayerId, slot: number) => number | null;
  /**
   * Cards a match turned face up on the table. Public — everyone sees these
   * without holding anything, which is the point of the reveal.
   */
  faceUpAt: (playerId: PlayerId, slot: number) => number | null;
  /** Cards just traded onto the discard pile, shown fanned so the table sees them. */
  pileFan: number[];
  /** What just happened to a slot: a look, a spy, a swap. Position only. */
  flashAt: (
    playerId: PlayerId,
    slot: number,
  ) => "peek" | "spy" | "swap" | "replace" | null;
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  startGame: () => void;
  nextRound: () => void;
  act: (action: Action) => void;
  dismissError: () => void;
}

export function useGame(): Game {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<{ message: string; at: number } | null>(
    null,
  );
  const [youId, setYouId] = useState<PlayerId | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [timer, setTimer] = useState<TimerView | null>(null);
  const [display, setDisplay] = useState<Display>(emptyDisplay);

  const connection = useRef<Connection | null>(null);
  const youRef = useRef<PlayerId | null>(null);
  const phaseRef = useRef<string | null>(null);
  const turnRef = useRef<PlayerId | null>(null);

  useEffect(() => {
    const conn = new Connection(
      (message) => {
        switch (message.type) {
          case "welcome":
            youRef.current = message.playerId;
            setYouId(message.playerId);
            localStorage.setItem(TOKEN_KEY, message.token);
            break;

          case "room":
            setRoom(message.room);
            break;

          case "state":
            setView(message.view);
            setTimer(message.timer);
            break;

          case "events": {
            const you = youRef.current;
            if (!you) break;

            const scope = phaseRef.current === "peeking" ? "peekPhase" : "turn";
            setDisplay((current) =>
              message.events.reduce(
                (acc, event) => applyClientEvent(acc, event, scope, you),
                current,
              ),
            );
            break;
          }

          case "error":
            setError({ message: message.message, at: Date.now() });
            break;
        }
      },
      () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) conn.send({ type: "reconnect", token });
      },
      setConnected,
    );

    connection.current = conn;
    conn.connect();
    return () => conn.close();
  }, []);

  // A look expires with the entitlement that earned it: opening peeks die when
  // play begins, a power's look dies when the turn moves on.
  useEffect(() => {
    if (!view) return;

    if (phaseRef.current === "peeking" && view.phase !== "peeking") {
      setDisplay(onPeekPhaseEnded);
    }
    if (turnRef.current !== null && turnRef.current !== view.currentPlayerId) {
      // The look you earned dies with the turn that earned it — from here on
      // it is yours to remember, not the client's.
      setDisplay(onTurnChanged);
    }

    phaseRef.current = view.phase;
    turnRef.current = view.currentPlayerId;
  }, [view]);

  // Markers fade on their own, so the table shows what is happening now rather
  // than a growing pile of history.
  useEffect(() => {
    if (display.flashes.length === 0) return;
    const handle = setInterval(
      () => setDisplay((current) => expireFlashes(current, Date.now())),
      250,
    );
    return () => clearInterval(handle);
  }, [display.flashes.length]);

  // A rejected move is a transient nudge, not a state you have to dismiss.
  useEffect(() => {
    if (!error) return;
    const handle = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(handle);
  }, [error]);

  const send = useCallback((action: Action) => {
    connection.current?.send({ type: "action", action });
  }, []);

  return {
    connected,
    error: error?.message ?? null,
    youId,
    room,
    view,
    timer,
    cardAt: useCallback(
      (playerId, slot) => revealed(display.reveals, playerId, slot),
      [display],
    ),
    faceUpAt: useCallback(
      (playerId, slot) => faceUpInHand(display, playerId, slot),
      [display],
    ),
    pileFan: display.pileFan,
    flashAt: useCallback(
      (playerId, slot) =>
        display.flashes.find(
          (flash) => flash.playerId === playerId && flash.slot === slot,
        )?.kind ?? null,
      [display],
    ),
    createRoom: useCallback((nickname) => {
      connection.current?.send({ type: "create_room", nickname });
    }, []),
    joinRoom: useCallback((code, nickname) => {
      connection.current?.send({ type: "join_room", code, nickname });
    }, []),
    startGame: useCallback(() => {
      connection.current?.send({ type: "start_game" });
    }, []),
    nextRound: useCallback(() => {
      connection.current?.send({ type: "next_round" });
    }, []),
    act: send,
    dismissError: useCallback(() => setError(null), []),
  };
}
