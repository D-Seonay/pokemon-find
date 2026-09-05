import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  Ack,
  ClientToServerEvents,
  JoinPayload,
  RoomState,
  ServerToClientEvents,
} from "@pkfind/shared";
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { RoomStore } from "../rooms/RoomStore.js";
import { registerHandlers } from "./handlers.js";
import type { AppServer } from "./types.js";

const config = loadConfig({
  COUNTDOWN_MS: "100",
  ROUND_REVEAL_MS: "100",
  RECONNECT_GRACE_MS: "200",
  ROOM_EMPTY_TTL_MS: "200",
});

let httpServer: HttpServer;
let io: AppServer;
let store: RoomStore;
let url = "";
const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];

function client(): Socket<ServerToClientEvents, ClientToServerEvents> {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  clients.push(socket);
  return socket;
}

function emit<E extends keyof ClientToServerEvents, T>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: E,
  input: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.emit as (e: E, i: unknown, ack: (r: Ack<T>) => void) => void)(event, input, resolve);
  });
}

function once<T>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  event: keyof ServerToClientEvents,
): Promise<T> {
  return new Promise((resolve) => socket.once(event as never, resolve as never));
}

beforeEach(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  store = new RoomStore(config, io);
  registerHandlers(io, store, config);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.close();
  store.stopPurge();
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("handlers Socket.IO", () => {
  it("crée une room et renvoie un code à 4 caractères", async () => {
    const host = client();
    const ack = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(ack.data.state.players[0]?.isHost).toBe(true);
  });

  it("refuse un pseudo invalide", async () => {
    const ack = await emit(client(), "room:create", { nickname: "x", settings: DEFAULT_SETTINGS });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_NICKNAME" });
  });

  it("refuse un code inconnu", async () => {
    const ack = await emit(client(), "room:join", { roomCode: "ZZZZ", nickname: "Léa" });
    expect(ack).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
  });

  it("refuse un code mal formé sans correspondance approximative", async () => {
    const ack = await emit(client(), "room:join", { roomCode: "AB0D", nickname: "Léa" });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_CODE" });
  });

  it("diffuse l'état à tous quand un joueur rejoint", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");

    const stateOnHost = once<RoomState>(host, "room:state");
    await emit(client(), "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    const state = await stateOnHost;
    expect(state.players.map((p) => p.nickname)).toEqual(["Mathéo", "Léa"]);
  });

  it("interdit à un invité de modifier les réglages", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    const ack = await emit(guest, "room:settings", {
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    expect(ack).toMatchObject({ ok: false, code: "NOT_HOST" });
  });

  it("joue une partie complète à deux et produit un classement", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, generations: [1], roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    const ended = once<{ standings: Array<{ playerId: string; score: number }> }>(host, "game:end");
    await emit(host, "room:start", {});

    for (let index = 0; index < 5; index++) {
      const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
      expect(Object.keys(started).sort()).toEqual(
        ["endsAt", "roundCount", "roundIndex", "serverNow", "targetId"].sort(),
      );
      await emit(host, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId,
      });
      await emit(guest, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId === 1 ? 2 : 1,
      });
    }

    const result = await ended;
    expect(result.standings[0]?.playerId).toBe(created.data.playerId);
    expect(result.standings[0]?.score).toBe(5000);
  });

  it("révèle le Pokémon cible uniquement à la révélation", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });

    const revealed = once<{ target: { id: number; nameFr: string } }>(host, "round:reveal");
    await emit(host, "room:start", {});
    const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
    await emit(host, "round:answer", {
      roundIndex: started.roundIndex,
      pokemonId: started.targetId,
    });
    await emit(guest, "round:answer", {
      roundIndex: started.roundIndex,
      pokemonId: started.targetId,
    });

    const reveal = await revealed;
    expect(reveal.target.id).toBe(started.targetId);
    expect(typeof reveal.target.nameFr).toBe("string");
  });

  it("refuse de rejoindre une partie déjà commencée", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    await emit(client(), "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    await emit(host, "room:start", {});

    const ack = await emit(client(), "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Retardataire",
    });
    expect(ack).toMatchObject({ ok: false, code: "GAME_IN_PROGRESS" });
  });

  it("conserve la place d'un joueur qui se reconnecte", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    const disconnected = once<RoomState>(host, "room:state");
    guest.close();
    const afterDrop = await disconnected;
    expect(afterDrop.players.find((p) => p.nickname === "Léa")?.connected).toBe(false);

    const back = client();
    const ack = await emit<"room:rejoin", { state: RoomState }>(back, "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
    });
    expect(ack.ok).toBe(true);
  });

  it("refuse une reconnexion avec un mauvais jeton", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const ack = await emit(client(), "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: created.data.playerId,
      playerToken: "faux",
    });
    expect(ack).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
  });
});
