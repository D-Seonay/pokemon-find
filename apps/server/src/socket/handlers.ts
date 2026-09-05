import { type Ack, ERROR_MESSAGES, type ErrorCode } from "@pkfind/shared";
import type { Config } from "../config.js";
import { log } from "../log.js";
import { normalizeCode } from "../rooms/codes.js";
import { RoomError } from "../rooms/Room.js";
import type { RoomStore } from "../rooms/RoomStore.js";
import { createRateLimiter } from "./rateLimit.js";
import type { AppServer, AppSocket } from "./types.js";

const MAX_EVENTS = 20;
const WINDOW_MS = 10_000;
const MAX_VIOLATIONS = 3;

function fail(code: ErrorCode): Ack<never> {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

function run<T>(action: () => T): Ack<T> {
  try {
    return { ok: true, data: action() };
  } catch (error) {
    if (error instanceof RoomError) return fail(error.code);
    log.error("handler_failed", { message: String(error) });
    return fail("INTERNAL");
  }
}

export function registerHandlers(io: AppServer, store: RoomStore, config: Config): void {
  const allow = createRateLimiter(MAX_EVENTS, WINDOW_MS);
  const violations = new Map<string, number>();

  io.on("connection", (socket: AppSocket) => {
    socket.use((_event, next) => {
      if (allow(socket.id)) {
        next();
        return;
      }
      const count = (violations.get(socket.id) ?? 0) + 1;
      violations.set(socket.id, count);
      if (count >= MAX_VIOLATIONS) socket.disconnect(true);
      next(new Error("RATE_LIMITED"));
    });

    function currentRoom() {
      const code = socket.data.roomCode;
      if (!code) throw new RoomError("NOT_IN_ROOM");
      return store.get(code);
    }

    function selfId(): string {
      const id = socket.data.playerId;
      if (!id) throw new RoomError("NOT_IN_ROOM");
      return id;
    }

    socket.on("room:create", ({ nickname, settings }, ack) => {
      ack(
        run(() => {
          const room = store.create();
          try {
            room.updateSettingsUnchecked(settings);
            const seat = room.addPlayer(nickname);
            socket.data = { roomCode: room.code, playerId: seat.playerId };
            void socket.join(room.code);
            return {
              roomCode: room.code,
              playerId: seat.playerId,
              playerToken: seat.playerToken,
              nickname: seat.nickname,
              state: room.toState(),
            };
          } catch (error) {
            store.destroy(room.code, "empty");
            throw error;
          }
        }),
      );
    });

    socket.on("room:join", ({ roomCode, nickname }, ack) => {
      ack(
        run(() => {
          const room = store.get(normalizeCode(roomCode));
          const seat = room.addPlayer(nickname);
          socket.data = { roomCode: room.code, playerId: seat.playerId };
          void socket.join(room.code);
          return {
            roomCode: room.code,
            playerId: seat.playerId,
            playerToken: seat.playerToken,
            nickname: seat.nickname,
            state: room.toState(),
          };
        }),
      );
    });

    socket.on("room:rejoin", ({ roomCode, playerId, playerToken }, ack) => {
      ack(
        run(() => {
          const room = store.get(normalizeCode(roomCode));
          room.rejoin(playerId, playerToken);
          socket.data = { roomCode: room.code, playerId };
          void socket.join(room.code);
          return { state: room.toState() };
        }),
      );
    });

    socket.on("room:settings", ({ settings }, ack) => {
      ack(
        run(() => {
          const room = currentRoom();
          room.updateSettings(selfId(), settings);
          return { state: room.toState() };
        }),
      );
    });

    socket.on("room:start", (_input, ack) => {
      ack(
        run(() => {
          currentRoom().start(selfId());
          return null;
        }),
      );
    });

    socket.on("room:playAgain", (_input, ack) => {
      ack(
        run(() => {
          const room = currentRoom();
          room.playAgain(selfId());
          return { state: room.toState() };
        }),
      );
    });

    socket.on("round:answer", ({ roundIndex, pokemonId }, ack) => {
      ack(
        run(() => {
          currentRoom().answer(selfId(), roundIndex, pokemonId);
          return { accepted: true as const };
        }),
      );
    });

    socket.on("room:leave", (_input, ack) => {
      ack(
        run(() => {
          const code = socket.data.roomCode;
          const id = socket.data.playerId;
          if (code && id) store.tryGet(code)?.removePlayer(id);
          socket.data = {};
          return null;
        }),
      );
    });

    socket.on("disconnect", () => {
      violations.delete(socket.id);
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = store.tryGet(roomCode);
      if (!room) return;
      room.markDisconnected(playerId);
      setTimeout(() => {
        const stillThere = store.tryGet(roomCode);
        if (!stillThere) return;
        if (!stillThere.isConnected(playerId)) stillThere.removePlayer(playerId);
      }, config.reconnectGraceMs).unref();
    });
  });
}
