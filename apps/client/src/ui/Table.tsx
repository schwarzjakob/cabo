import { useEffect, useState } from "react";
import { powerOf, type PlayerId } from "@cabo/engine";
import type { Game } from "../state/useGame.js";
import { Card } from "./Card.js";
import { Timer } from "./Timer.js";
import { RoundSummary } from "./RoundSummary.js";

const PEEK_SECONDS = 30;
const TURN_SECONDS = 60;

/** What the player is in the middle of doing. Purely local to this client. */
type Mode =
  | { kind: "idle" }
  | { kind: "place"; source: "drawn" | "discard" }
  | { kind: "power"; power: "peek" | "spy" | "swap"; ownSlot?: number };

export function Table({ game }: { game: Game }) {
  const view = game.view!;
  const you = game.youId!;
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [selection, setSelection] = useState<number[]>([]);

  const yourTurn = view.currentPlayerId === you;
  const holding = view.heldCard !== null;

  // Reset the local intent whenever the turn or the held card changes under us.
  useEffect(() => {
    setMode({ kind: "idle" });
    setSelection([]);
  }, [view.currentPlayerId, view.phase, view.heldCard === null]);

  const nicknameOf = (id: PlayerId) =>
    game.room?.seats.find((seat) => seat.id === id)?.nickname ?? "player";

  const others = view.players.filter((player) => player.id !== you);
  const yours = view.players.find((player) => player.id === you)!;

  if (view.phase === "roundOver" || view.phase === "gameOver") {
    return <RoundSummary game={game} nicknameOf={nicknameOf} />;
  }

  const toggle = (slot: number) =>
    setSelection((current) =>
      current.includes(slot)
        ? current.filter((each) => each !== slot)
        : [...current, slot],
    );

  const onOwnSlot = (slot: number) => {
    if (view.phase === "peeking") {
      if (!yours.peeksUsed.includes(slot) && yours.peeksUsed.length < 2) {
        game.act({ type: "peek_card", slot });
      }
      return;
    }
    if (!yourTurn) return;

    if (mode.kind === "power" && mode.power === "peek") {
      game.act({ type: "use_power", target: { kind: "peek", slot } });
      return;
    }
    if (mode.kind === "power" && mode.power === "swap") {
      setMode({ ...mode, ownSlot: slot });
      return;
    }
    if (mode.kind === "place") toggle(slot);
  };

  const onOpponentSlot = (playerId: PlayerId, slot: number) => {
    if (!yourTurn || mode.kind !== "power") return;

    if (mode.power === "spy") {
      game.act({ type: "use_power", target: { kind: "spy", playerId, slot } });
    }
    if (mode.power === "swap" && mode.ownSlot !== undefined) {
      game.act({
        type: "use_power",
        target: {
          kind: "swap",
          ownSlot: mode.ownSlot,
          playerId,
          theirSlot: slot,
        },
      });
    }
  };

  const commitPlacement = (source: "drawn" | "discard") => {
    if (selection.length === 0) return;

    const target =
      selection.length === 1
        ? ({ kind: "slot", slot: selection[0]! } as const)
        : ({
            kind: "match",
            slots: [...selection],
            into: selection[0]!,
          } as const);

    game.act(
      source === "drawn"
        ? { type: "place_drawn", target }
        : { type: "take_discard", target },
    );
    setSelection([]);
  };

  const heldPower = view.heldCard === null ? null : powerOf(view.heldCard);

  return (
    <div className="screen table">
      <header className="table__top">
        <Timer
          timer={game.timer}
          total={view.phase === "peeking" ? PEEK_SECONDS : TURN_SECONDS}
          label={
            view.phase === "peeking"
              ? "Look at two cards"
              : yourTurn
                ? "Your turn"
                : `${nicknameOf(view.currentPlayerId ?? "")}'s turn`
          }
        />
        {view.caboCalledBy ? (
          <div className="banner">
            {nicknameOf(view.caboCalledBy)} called CABO — last turns
          </div>
        ) : null}
      </header>

      <section className="opponents">
        {others.map((player) => (
          <div
            key={player.id}
            className={`opponent ${
              view.currentPlayerId === player.id ? "opponent--active" : ""
            }`}
          >
            <div className="opponent__name">
              {nicknameOf(player.id)}
              <span className="opponent__score">{player.totalScore}</span>
            </div>
            <div className="hand hand--small">
              {player.slots.map((filled, slot) => (
                <Card
                  key={slot}
                  small
                  empty={!filled}
                  value={game.cardAt(player.id, slot)}
                  highlighted={player.peeksUsed.includes(slot)}
                  onSelect={() => onOpponentSlot(player.id, slot)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="piles">
        <div className="pile">
          <div className="pile__stack">
            <div className="card card--back">{view.drawPileCount}</div>
          </div>
          <span className="pile__label">Draw</span>
        </div>

        {view.heldCard !== null ? (
          <div className="pile pile--held">
            <div className="card card--face-up card--held">
              {view.heldCard}
            </div>
            <span className="pile__label">
              {heldPower ? heldPower.toUpperCase() : "In hand"}
            </span>
          </div>
        ) : null}

        <div className="pile">
          <div className="pile__stack">
            <div className="card card--face-up">{view.discardTop ?? ""}</div>
          </div>
          <span className="pile__label">Discard</span>
        </div>
      </section>

      <section className="you">
        <div className="opponent__name">
          You
          <span className="opponent__score">{yours.totalScore}</span>
        </div>
        <div className="hand">
          {yours.slots.map((filled, slot) => (
            <Card
              key={slot}
              empty={!filled}
              value={game.cardAt(you, slot)}
              selected={selection.includes(slot)}
              highlighted={
                view.phase === "peeking" && yours.peeksUsed.includes(slot)
              }
              onSelect={() => onOwnSlot(slot)}
            />
          ))}
        </div>
      </section>

      <footer className="actions">
        {view.phase === "peeking" ? (
          <>
            <p className="hint">
              Tap two cards to look, hold to see them again, then confirm.
            </p>
            <button
              type="button"
              className="button button--primary"
              disabled={yours.ready}
              onClick={() => game.act({ type: "ready" })}
            >
              {yours.ready ? "Waiting for others…" : "Ready"}
            </button>
          </>
        ) : !yourTurn ? (
          <p className="hint">
            Waiting for {nicknameOf(view.currentPlayerId ?? "")}…
          </p>
        ) : mode.kind === "power" ? (
          <>
            <p className="hint">
              {mode.power === "peek"
                ? "Tap one of your own cards."
                : mode.power === "spy"
                  ? "Tap an opponent's card."
                  : mode.ownSlot === undefined
                    ? "Tap one of your cards to give away."
                    : "Now tap the opponent card to take."}
            </p>
            <button
              type="button"
              className="button"
              onClick={() => setMode({ kind: "idle" })}
            >
              Cancel
            </button>
          </>
        ) : holding ? (
          <>
            <p className="hint">
              {selection.length > 1
                ? `Trade ${selection.length} matching cards`
                : "Tap a slot to keep it there, or discard it."}
            </p>
            <div className="actions__row">
              <button
                type="button"
                className="button button--primary"
                disabled={selection.length === 0}
                onClick={() => commitPlacement("drawn")}
              >
                {selection.length > 1 ? "Trade match" : "Keep"}
              </button>
              {heldPower ? (
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    setMode({ kind: "power", power: heldPower })
                  }
                >
                  Use {heldPower}
                </button>
              ) : null}
              <button
                type="button"
                className="button"
                onClick={() => game.act({ type: "discard_drawn" })}
              >
                Discard
              </button>
            </div>
          </>
        ) : mode.kind === "place" && mode.source === "discard" ? (
          <>
            <p className="hint">Tap where the {view.discardTop} should go.</p>
            <div className="actions__row">
              <button
                type="button"
                className="button button--primary"
                disabled={selection.length === 0}
                onClick={() => commitPlacement("discard")}
              >
                {selection.length > 1 ? "Trade match" : "Place"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setMode({ kind: "idle" });
                  setSelection([]);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="actions__row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => game.act({ type: "draw" })}
            >
              Draw
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setMode({ kind: "place", source: "discard" })}
            >
              Take {view.discardTop}
            </button>
            <button
              type="button"
              className="button button--cabo"
              disabled={view.caboCalledBy !== null}
              onClick={() => game.act({ type: "call_cabo" })}
            >
              CABO
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
