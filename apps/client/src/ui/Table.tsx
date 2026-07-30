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
  | { kind: "replace" }
  | { kind: "match" }
  | { kind: "power"; power: "peek" | "spy" | "swap"; ownSlot?: number };

export function Table({ game }: { game: Game }) {
  const view = game.view!;
  const you = game.youId!;
  const [mode, setMode] = useState<Mode>({ kind: "idle" });

  const yourTurn = view.currentPlayerId === you;
  const holding = view.heldCard !== null;

  // Reset the local intent whenever the turn or the held card changes under us.
  useEffect(() => {
    setMode({ kind: "idle" });
  }, [
    view.currentPlayerId,
    view.phase,
    view.turnStage,
    view.heldCard === null,
  ]);

  const nicknameOf = (id: PlayerId) =>
    game.room?.seats.find((seat) => seat.id === id)?.nickname ?? "player";

  const others = view.players.filter((player) => player.id !== you);
  const yours = view.players.find((player) => player.id === you)!;

  if (view.phase === "roundOver" || view.phase === "gameOver") {
    return <RoundSummary game={game} nicknameOf={nicknameOf} />;
  }

  const attempt = view.matchAttempt;
  const revealed = attempt?.revealed ?? [];

  /** Pressing a card is looking at it: the first press spends a peek. */
  const onHoldOwnSlot = (slot: number) => {
    if (view.phase !== "peeking") return;
    if (yours.peeksUsed.includes(slot)) return;
    if (yours.peeksUsed.length >= 2) return;

    game.act({ type: "peek_card", slot });
  };

  const onOwnSlot = (slot: number) => {
    if (view.phase === "peeking") return;
    if (!yourTurn) return;
    // Nothing but Done gets out of a turn held open for a look.
    if (view.turnStage === "resolving") return;

    if (mode.kind === "power" && mode.power === "peek") {
      game.act({ type: "use_power", target: { kind: "peek", slot } });
      return;
    }
    if (mode.kind === "power" && mode.power === "swap") {
      setMode({ ...mode, ownSlot: slot });
      return;
    }

    // Cards are inert until an action has been chosen — deciding what you are
    // doing comes before picking what you are doing it to.
    if (mode.kind === "replace") {
      game.act({ type: "place_drawn", target: { kind: "slot", slot } });
      return;
    }
    if (mode.kind === "match" && !revealed.includes(slot)) {
      game.act({ type: "reveal_for_match", slot });
    }
  };

  const onOpponentSlot = (playerId: PlayerId, slot: number) => {
    if (!yourTurn || mode.kind !== "power") return;
    if (view.turnStage === "resolving") return;

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
                  faceUp={game.faceUpAt(player.id, slot)}
                  flash={game.flashAt(player.id, slot)}
                  targetable={
                    yourTurn &&
                    mode.kind === "power" &&
                    (mode.power === "spy" || mode.ownSlot !== undefined)
                  }
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
        ) : view.someoneIsHolding ? (
          // Everyone can see that a card has been drawn and is being decided
          // over — just not which card it is.
          <div className="pile pile--held">
            <div className="card card--back card--held">?</div>
            <span className="pile__label">
              {nicknameOf(view.currentPlayerId ?? "")} is deciding
            </span>
          </div>
        ) : null}

        <div className="pile">
          <div className="pile__stack">
            {/* Cards just traded away are fanned on top, so the table can see
                what went out without having caught the reveal as it happened. */}
            {game.pileFan.length > 0 ? (
              <div className="pile__fan">
                {game.pileFan.map((card, index) => (
                  <div
                    key={index}
                    className="card card--face-up card--traded"
                    style={{ marginLeft: index === 0 ? 0 : -34 }}
                  >
                    {card}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card card--face-up">{view.discardTop ?? ""}</div>
            )}
          </div>
          <span className="pile__label">
            {game.pileFan.length > 0 ? "Traded" : "Discard"}
          </span>
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
              faceUp={game.faceUpAt(you, slot)}
              selected={
                revealed.includes(slot) ||
                (mode.kind === "power" &&
                  mode.power === "swap" &&
                  mode.ownSlot === slot)
              }
              flash={game.flashAt(you, slot)}
              targetable={
                yourTurn &&
                (mode.kind === "replace" ||
                  mode.kind === "match" ||
                  (mode.kind === "power" && mode.power !== "spy"))
              }
              highlighted={
                view.phase === "peeking" && yours.peeksUsed.includes(slot)
              }
              onSelect={() => onOwnSlot(slot)}
              onHold={() => onHoldOwnSlot(slot)}
            />
          ))}
        </div>
      </section>

      <footer className="actions">
        {view.phase === "peeking" ? (
          <>
            <p className="hint">
              Hold a card to look at it — you get two. Then hit Ready.
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
            {view.turnStage === "resolving"
              ? `${nicknameOf(view.currentPlayerId ?? "")} is taking it in…`
              : `Waiting for ${nicknameOf(view.currentPlayerId ?? "")}…`}
          </p>
        ) : view.turnStage === "resolving" ? (
          <>
            <p className="hint">
              Hold a card to look. Your clock is still running.
            </p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => game.act({ type: "end_turn" })}
            >
              Done
            </button>
          </>
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
        ) : mode.kind === "match" ? (
          <>
            <p className="hint">
              {revealed.length === 0
                ? "Turn over a card. Everyone sees it, and there is no taking it back."
                : revealed.length === 1
                  ? "Turn over a second — if they disagree you lose the turn."
                  : "They match. Trade them, or risk one more."}
            </p>
            <div className="actions__row">
              <button
                type="button"
                className="button button--primary"
                disabled={revealed.length < 2}
                onClick={() =>
                  game.act({ type: "commit_match", into: revealed[0]! })
                }
              >
                Trade {revealed.length > 0 ? revealed.length : ""}
              </button>
              {revealed.length === 0 ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setMode({ kind: "idle" })}
                >
                  Back
                </button>
              ) : null}
            </div>
          </>
        ) : mode.kind === "replace" ? (
          <>
            <p className="hint">Tap the card to replace.</p>
            <button
              type="button"
              className="button"
              onClick={() => setMode({ kind: "idle" })}
            >
              Back
            </button>
          </>
        ) : holding ? (
          <>
            <p className="hint">
              You drew a {view.heldCard}. Decide what to do with it.
            </p>
            <div className="actions__row">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setMode({ kind: "replace" })}
              >
                Replace
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setMode({ kind: "match" })}
              >
                Match
              </button>
              {heldPower && view.heldFrom === "draw" ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setMode({ kind: "power", power: heldPower })}
                >
                  {heldPower}
                </button>
              ) : null}
              {view.heldFrom === "draw" ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => game.act({ type: "discard_drawn" })}
                >
                  Discard
                </button>
              ) : null}
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
              onClick={() => game.act({ type: "take_discard" })}
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
