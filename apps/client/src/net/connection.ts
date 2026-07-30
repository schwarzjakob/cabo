import type { ClientMessage, ServerMessage } from "@cabo/protocol";

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `ws://${location.hostname}:8787`;

export type Handler = (message: ServerMessage) => void;

/**
 * A reconnecting socket. Knows nothing about CABO — it moves JSON and reports
 * connection state, so the game logic never has to think about the wire.
 */
export class Connection {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onMessage: Handler,
    private readonly onOpen: () => void,
    private readonly onStatus: (connected: boolean) => void,
  ) {}

  connect(): void {
    if (this.socket) return;

    const socket = new WebSocket(WS_URL);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.onStatus(true);
      for (const message of this.queue.splice(0)) this.send(message);
      this.onOpen();
    });

    socket.addEventListener("message", (event) => {
      this.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    });

    socket.addEventListener("close", () => {
      this.socket = null;
      this.onStatus(false);
      this.retry = setTimeout(() => this.connect(), 1000);
    });

    socket.addEventListener("error", () => socket.close());
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      this.queue.push(message);
      this.connect();
    }
  }

  close(): void {
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
  }
}
