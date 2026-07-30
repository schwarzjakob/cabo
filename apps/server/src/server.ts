import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  ClientMessage,
  ServerMessage,
} from "@cabo/protocol";
import type { GameEvent, PlayerId } from "@cabo/engine";
import { Room } from "./room.js";

const PORT = Number(process.env.PORT ?? 8787);

const rooms = new Map<string, Room>();
/** Reconnect tokens are unique across rooms, so one index is enough. */
const tokens = new Map<string, { code: string; playerId: PlayerId }>();
const sockets = new Map<PlayerId, WebSocket>();

interface Session {
  code: string;
  playerId: PlayerId;
}

const app = Fastify({ logger: false });

app.get("/health", async () => ({ ok: true, rooms: rooms.size }));

const server = app.server;
const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  let session: Session | null = null;

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return send(socket, { type: "error", message: "Malformed message" });
    }

    try {
      session = handle(socket, session, message) ?? session;
    } catch (error) {
      send(socket, {
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong",
      });

      // Resend state after a rejection, so a client that has drifted out of
      // step is put back in it rather than left guessing.
      const room = session ? rooms.get(session.code) : undefined;
      if (room?.hasStarted && session) {
        send(socket, {
          type: "state",
          view: room.viewFor(session.playerId),
          timer: room.timer(),
        });
      }
    }
  });

  socket.on("close", () => {
    if (!session) return;
    const room = rooms.get(session.code);
    sockets.delete(session.playerId);
    if (!room) return;

    room.disconnect(session.playerId);
    broadcast(room, []);
    if (room.isEmpty) rooms.delete(room.code);
  });
});

function handle(
  socket: WebSocket,
  session: Session | null,
  message: ClientMessage,
): Session | null {
  switch (message.type) {
    case "create_room": {
      const room = new Room(randomUUID());
      rooms.set(room.code, room);
      room.onChange((events) => broadcast(room, events));
      return seat(socket, room, message.nickname);
    }

    case "join_room": {
      const room = requireRoom(message.code);
      return seat(socket, room, message.nickname);
    }

    case "reconnect": {
      const found = tokens.get(message.token);
      if (!found) throw new Error("Unknown reconnect token");

      const room = requireRoom(found.code);
      room.reconnect(message.token);
      sockets.set(found.playerId, socket);

      send(socket, {
        type: "welcome",
        roomCode: room.code,
        playerId: found.playerId,
        token: message.token,
      });
      broadcast(room, []);
      return found;
    }

    case "start_game": {
      const { room, playerId } = requireSession(session);
      const host = room.view().seats.find((seat) => seat.isHost);
      if (host?.id !== playerId) {
        throw new Error("Only the host can start the game");
      }
      room.start();
      broadcast(room, []);
      return session;
    }

    case "action": {
      const { room, playerId } = requireSession(session);
      room.act(playerId, message.action);
      return session;
    }

    case "next_round": {
      const { room } = requireSession(session);
      room.nextRound();
      broadcast(room, []);
      return session;
    }
  }
}

function seat(socket: WebSocket, room: Room, nickname: string): Session {
  const { playerId, token } = room.join(nickname);
  tokens.set(token, { code: room.code, playerId });
  sockets.set(playerId, socket);

  send(socket, {
    type: "welcome",
    roomCode: room.code,
    playerId,
    token,
  });
  broadcast(room, []);

  return { code: room.code, playerId };
}

/**
 * Push the room to everyone in it. Each player's state and events are redacted
 * individually — this is the only place game data leaves the server, so it is
 * the only place that has to get hidden information right.
 */
function broadcast(room: Room, events: readonly GameEvent[]): void {
  const view = room.view();

  for (const playerId of room.playerIds) {
    const socket = sockets.get(playerId);
    if (!socket || socket.readyState !== socket.OPEN) continue;

    send(socket, { type: "room", room: view });

    if (room.hasStarted) {
      send(socket, {
        type: "state",
        view: room.viewFor(playerId),
        timer: room.timer(),
      });
    }

    if (events.length > 0) {
      send(socket, { type: "events", events: room.eventsFor(events, playerId) });
    }
  }
}

function requireRoom(code: string): Room {
  const room = rooms.get(code.trim().toUpperCase());
  if (!room) throw new Error(`No room with code ${code}`);
  return room;
}

function requireSession(session: Session | null): {
  room: Room;
  playerId: PlayerId;
} {
  if (!session) throw new Error("You are not in a room");
  return { room: requireRoom(session.code), playerId: session.playerId };
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`CABO server listening on :${PORT}`);
});
