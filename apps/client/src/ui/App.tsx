import { useGame } from "../state/useGame.js";
import { Lobby } from "./Lobby.js";
import { Table } from "./Table.js";

export function App() {
  const game = useGame();

  return (
    <>
      {!game.connected ? (
        <div className="offline">Reconnecting…</div>
      ) : null}

      {game.error ? (
        <button type="button" className="toast" onClick={game.dismissError}>
          {game.error}
        </button>
      ) : null}

      {game.view && game.room?.started ? (
        <Table game={game} />
      ) : (
        <Lobby game={game} />
      )}
    </>
  );
}
