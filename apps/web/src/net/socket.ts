import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import { type Socket, io } from "socket.io-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  socket ??= io({ transports: ["websocket"], autoConnect: true });
  return socket;
}
