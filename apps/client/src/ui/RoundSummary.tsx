import type { PlayerId } from "@cabo/engine";
import type { Game } from "../state/useGame.js";

interface Props {
  game: Game;
  nicknameOf: (id: PlayerId) => string;
}

export function RoundSummary({ game, nicknameOf }: Props) {
  const view = game.view!;
  const gameOver = view.phase === "gameOver";
  const hands = view.revealedHands ?? [];

  const standings = [...view.players].sort(
    (a, b) => a.totalScore - b.totalScore,
  );

  return (
    <div className="screen screen--centred">
      <h1 className="brand">{gameOver ? "Game over" : "Round over"}</h1>
      {gameOver ? (
        <p className="tagline">
          {nicknameOf(standings[0]!.id)} wins with {standings[0]!.totalScore}
        </p>
      ) : null}

      <ul className="reveal">
        {hands.map((hand) => (
          <li key={hand.playerId}>
            <span className="reveal__name">{nicknameOf(hand.playerId)}</span>
            <span className="reveal__cards">
              {hand.slots.map((card, slot) => (
                <span key={slot} className="chip">
                  {card ?? "–"}
                </span>
              ))}
            </span>
            <span className="reveal__total">
              {view.players.find((p) => p.id === hand.playerId)!.totalScore}
            </span>
          </li>
        ))}
      </ul>

      {!gameOver ? (
        <button
          type="button"
          className="button button--primary"
          onClick={game.nextRound}
        >
          Next round
        </button>
      ) : null}
    </div>
  );
}
