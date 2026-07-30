import { useEffect, useState } from "react";
import { useGame } from "../state/useGame.js";
import { Lobby } from "./Lobby.js";
import { Table } from "./Table.js";

/**
 * "Reconnecting…" forever is a useless thing to stare at. After a few seconds
 * of failure, say what is actually wrong.
 */
function useOfflineMessage(connected: boolean): string | null {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (connected) {
      setStale(false);
      return;
    }
    const handle = setTimeout(() => setStale(true), 4000);
    return () => clearTimeout(handle);
  }, [connected]);

  if (connected) return null;
  return stale ? "Can't reach the server — is it running?" : "Connecting…";
}

export function App() {
  const game = useGame();
  const offline = useOfflineMessage(game.connected);

  return (
    <>
      {offline ? <div className="offline">{offline}</div> : null}

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
