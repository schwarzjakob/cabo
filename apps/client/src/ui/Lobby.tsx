import { useState } from "react";
import type { Game } from "../state/useGame.js";

export function Lobby({ game }: { game: Game }) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");

  if (game.room) return <WaitingRoom game={game} />;

  const canPlay = nickname.trim().length > 0;

  return (
    <div className="screen screen--centred">
      <h1 className="brand">CABO</h1>
      <p className="tagline">Lowest hand wins. Remember your cards.</p>

      <label className="field">
        <span>Your name</span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={16}
          placeholder="Jakob"
          autoComplete="off"
        />
      </label>

      <button
        type="button"
        className="button button--primary"
        disabled={!canPlay}
        onClick={() => game.createRoom(nickname)}
      >
        Create a room
      </button>

      <div className="divider">or join one</div>

      <label className="field">
        <span>Room code</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={4}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoComplete="off"
        />
      </label>

      <button
        type="button"
        className="button"
        disabled={!canPlay || code.length !== 4}
        onClick={() => game.joinRoom(code, nickname)}
      >
        Join
      </button>
    </div>
  );
}

function WaitingRoom({ game }: { game: Game }) {
  const room = game.room!;
  const you = room.seats.find((seat) => seat.id === game.youId);
  const enough = room.seats.length >= 2;

  return (
    <div className="screen screen--centred">
      <p className="tagline">Room code</p>
      <h1 className="brand brand--code">{room.code}</h1>
      <p className="tagline">Share it — 2 to 5 players.</p>

      <ul className="seats">
        {room.seats.map((seat) => (
          <li key={seat.id} className={seat.connected ? "" : "seat--away"}>
            {seat.nickname}
            {seat.isHost ? <span className="pill">host</span> : null}
            {seat.id === game.youId ? <span className="pill">you</span> : null}
          </li>
        ))}
      </ul>

      {you?.isHost ? (
        <button
          type="button"
          className="button button--primary"
          disabled={!enough}
          onClick={game.startGame}
        >
          {enough ? "Deal" : "Waiting for one more…"}
        </button>
      ) : (
        <p className="tagline">Waiting for the host to deal…</p>
      )}
    </div>
  );
}
