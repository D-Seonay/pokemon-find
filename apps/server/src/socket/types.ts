import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import type { Server, Socket } from "socket.io";

export type SocketData = { roomCode?: string; playerId?: string };

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
