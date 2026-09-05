import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import type { AppServer } from "../socket/types.js";
import { RoomError } from "./Room.js";
import { RoomStore } from "./RoomStore.js";

let httpServer: HttpServer;
let io: AppServer;

beforeEach(() => {
  httpServer = createServer();
  io = new Server(httpServer);
});

afterEach(async () => {
  await io.close();
  vi.useRealTimers();
});

describe("RoomStore", () => {
  it("détruit une room vide une fois ROOM_EMPTY_TTL_MS passé, pas avant", () => {
    vi.useFakeTimers();
    const config = loadConfig({ ROOM_EMPTY_TTL_MS: "1000", ROOM_MAX_AGE_MS: "3600000" });
    const store = new RoomStore(config, io);
    const room = store.create();
    expect(room.isEmpty).toBe(true);

    store.purge();
    expect(store.tryGet(room.code)).toBeDefined();

    vi.advanceTimersByTime(999);
    store.purge();
    expect(store.tryGet(room.code)).toBeDefined();

    vi.advanceTimersByTime(2);
    store.purge();
    expect(store.tryGet(room.code)).toBeUndefined();
  });

  it("ne détruit pas une room qui n'est plus vide, même après ROOM_EMPTY_TTL_MS", () => {
    vi.useFakeTimers();
    const config = loadConfig({ ROOM_EMPTY_TTL_MS: "1000", ROOM_MAX_AGE_MS: "3600000" });
    const store = new RoomStore(config, io);
    const room = store.create();

    store.purge();
    room.addPlayer("Mathéo");

    vi.advanceTimersByTime(1001);
    store.purge();
    expect(store.tryGet(room.code)).toBeDefined();
  });

  it("détruit toute room une fois ROOM_MAX_AGE_MS passé, même avec des joueurs", () => {
    vi.useFakeTimers();
    const config = loadConfig({ ROOM_MAX_AGE_MS: "60000", ROOM_EMPTY_TTL_MS: "3600000" });
    const store = new RoomStore(config, io);
    const room = store.create();
    room.addPlayer("Mathéo");

    vi.advanceTimersByTime(59999);
    store.purge();
    expect(store.tryGet(room.code)).toBeDefined();

    vi.advanceTimersByTime(2);
    store.purge();
    expect(store.tryGet(room.code)).toBeUndefined();
  });

  it("refuse de créer une room au-delà de MAX_ROOMS", () => {
    const config = loadConfig({ MAX_ROOMS: "1" });
    const store = new RoomStore(config, io);
    store.create();
    try {
      store.create();
      expect.unreachable("devrait avoir levé SERVER_BUSY");
    } catch (error) {
      expect(error).toBeInstanceOf(RoomError);
      expect((error as RoomError).code).toBe("SERVER_BUSY");
    }
  });

  it("stats() reflète les rooms et joueurs actifs", () => {
    const config = loadConfig();
    const store = new RoomStore(config, io);
    expect(store.stats()).toEqual({ rooms: 0, players: 0 });

    const room1 = store.create();
    room1.addPlayer("Mathéo");
    room1.addPlayer("Léa");
    const room2 = store.create();
    room2.addPlayer("Sacha");

    expect(store.stats()).toEqual({ rooms: 2, players: 3 });
  });

  it("lève CODE_EXHAUSTED quand le générateur de code ne produit que des collisions", () => {
    const config = loadConfig();
    const store = new RoomStore(config, io, () => "AAAA");
    store.create();
    try {
      store.create();
      expect.unreachable("devrait avoir levé CODE_EXHAUSTED");
    } catch (error) {
      expect(error).toBeInstanceOf(RoomError);
      expect((error as RoomError).code).toBe("CODE_EXHAUSTED");
    }
  });
});
