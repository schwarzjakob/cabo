import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, PlayerId, PlayerView } from "@cabo/engine";
import type { RoomView, TimerView } from "@cabo/protocol";
import { Connection } from "../net/connection.js";
import { applyEvent, forgetScope, revealed, type Reveals } from "./reveals.js";

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
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  startGame: () => void;
  nextRound: () => void;
  act: (action: Action) => void;
  dismissError: () => void;
}

export function useGame(): Game {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youId, setYouId] = useState<PlayerId | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [timer, setTimer] = useState<TimerView | null>(null);
  const [reveals, setReveals] = useState<Reveals>({});

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

          case "events":
            setReveals((current) => {
              const you = youRef.current;
              if (!you) return current;

              const scope = phaseRef.current === "peeking" ? "peekPhase" : "turn";
              return message.events.reduce(
                (acc, event) => applyEvent(acc, event, scope, you),
                current,
              );
            });
            break;

          case "error":
            setError(message.message);
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
      setReveals((current) => forgetScope(current, "peekPhase"));
    }
    if (turnRef.current !== null && turnRef.current !== view.currentPlayerId) {
      setReveals((current) => forgetScope(current, "turn"));
    }

    phaseRef.current = view.phase;
    turnRef.current = view.currentPlayerId;
  }, [view]);

  const send = useCallback((action: Action) => {
    connection.current?.send({ type: "action", action });
  }, []);

  return {
    connected,
    error,
    youId,
    room,
    view,
    timer,
    cardAt: useCallback(
      (playerId, slot) => revealed(reveals, playerId, slot),
      [reveals],
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
