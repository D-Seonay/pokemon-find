import { pokemonById } from "@pkfind/shared";
import type { Config } from "../config.js";
import { log } from "../log.js";
import type { AppServer } from "../socket/types.js";
import { generateCode } from "./codes.js";
import { Room, RoomError, type RoomListeners } from "./Room.js";

const PURGE_INTERVAL_MS = 15_000;

type Entry = { room: Room; emptySince: number | null };

export class RoomStore {
  private readonly rooms = new Map<string, Entry>();
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: Config,
    private readonly io: AppServer,
  ) {}

  create(): Room {
    if (this.rooms.size >= this.config.maxRooms) throw new RoomError("SERVER_BUSY");

    let code = generateCode();
    for (let attempt = 0; this.rooms.has(code); attempt++) {
      if (attempt >= 10) throw new RoomError("CODE_EXHAUSTED");
      code = generateCode();
    }

    const room = new Room(
      code,
      {
        countdownMs: this.config.countdownMs,
        revealMs: this.config.revealMs,
        answerGraceMs: this.config.answerGraceMs,
        allAnsweredDelayMs: 400,
      },
      this.listenersFor(code),
    );
    this.rooms.set(code, { room, emptySince: null });
    log.info("room_created", { code });
    return room;
  }

  get(code: string): Room {
    const entry = this.rooms.get(code);
    if (!entry) throw new RoomError("ROOM_NOT_FOUND");
    return entry.room;
  }

  tryGet(code: string): Room | undefined {
    return this.rooms.get(code)?.room;
  }

  destroy(code: string, reason: "expired" | "empty" | "shutdown"): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    entry.room.dispose();
    this.rooms.delete(code);
    this.io.to(code).emit("room:closed", { reason });
    log.info("room_destroyed", { code, reason });
  }

  destroyAll(reason: "expired" | "empty" | "shutdown"): void {
    for (const code of [...this.rooms.keys()]) this.destroy(code, reason);
  }

  stats(): { rooms: number; players: number } {
    let players = 0;
    for (const entry of this.rooms.values()) players += entry.room.playerCount;
    return { rooms: this.rooms.size, players };
  }

  startPurge(): void {
    this.purgeTimer ??= setInterval(() => this.purge(), PURGE_INTERVAL_MS);
  }

  stopPurge(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
  }

  /** Exposé pour les tests : exécute un cycle de purge immédiatement. */
  purge(): void {
    const now = Date.now();
    for (const [code, entry] of this.rooms) {
      if (now - entry.room.createdAt > this.config.roomMaxAgeMs) {
        this.destroy(code, "expired");
        continue;
      }
      if (entry.room.isEmpty) {
        entry.emptySince ??= now;
        if (now - entry.emptySince > this.config.roomEmptyTtlMs) this.destroy(code, "empty");
      } else {
        entry.emptySince = null;
      }
    }
  }

  private listenersFor(code: string): RoomListeners {
    const room = () => this.io.to(code);
    return {
      onState: (state) => room().emit("room:state", state),
      onCountdown: (payload) => room().emit("game:countdown", payload),
      onRoundStart: (payload) => room().emit("round:start", payload),
      onAnswered: (payload) => room().emit("round:answered", payload),
      onReveal: ({ targetId, ...rest }) =>
        room().emit("round:reveal", { ...rest, target: pokemonById(targetId) }),
      onEnd: (payload) => room().emit("game:end", payload),
    };
  }
}
