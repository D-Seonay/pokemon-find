import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  Ack,
  ClientToServerEvents,
  JoinPayload,
  RoomState,
  ServerToClientEvents,
  Standing,
} from "@pkfind/shared";
import { DEFAULT_BLITZ_SETTINGS, DEFAULT_SETTINGS, POKEMON } from "@pkfind/shared";
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

/** Génération 6 : le plus petit pool du jeu (72 Pokémon), donc le plus rapide à épuiser. */
const SMALL_POOL = { generations: [6 as const], durationMs: 60_000 };
const SMALL_POOL_NAMES = POKEMON.filter((p) => p.generation === 6).map((p) => p.nameFr);

let httpServer: HttpServer;
let io: AppServer;
let store: RoomStore;
let url = "";
const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];

type AppClient = Socket<ServerToClientEvents, ClientToServerEvents>;

function client(): AppClient {
  const socket = connect(url, { transports: ["websocket"], forceNew: true });
  clients.push(socket);
  return socket;
}

function emit<E extends keyof ClientToServerEvents, T>(
  socket: AppClient,
  event: E,
  input: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket.emit as (e: E, i: unknown, ack: (r: Ack<T>) => void) => void)(event, input, resolve);
  });
}

function once<T>(socket: AppClient, event: keyof ServerToClientEvents): Promise<T> {
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

/**
 * Une room à deux joueurs en mode blitz, partie lancée, chronomètre ouvert.
 * `host` a consommé 3 événements (create, mode, start), `guest` un seul (join) : les
 * tests de débit ci-dessous comptent à partir de là.
 */
async function startedBlitz(settings = SMALL_POOL): Promise<{
  host: AppClient;
  guest: AppClient;
  session: JoinPayload;
  guestSession: JoinPayload;
  startPayload: { endsAt: number; serverNow: number; found: number[] };
}> {
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

  const mode = await emit<"room:mode", { state: RoomState }>(host, "room:mode", {
    mode: "blitz",
    blitz: settings,
  });
  if (!mode.ok) throw new Error("choix du mode échoué");

  const startedOnGuest = once<{ endsAt: number; serverNow: number; found: number[] }>(
    guest,
    "blitz:start",
  );
  await emit(host, "room:start", {});
  const startPayload = await startedOnGuest;
  return {
    host,
    guest,
    session: created.data,
    guestSession: joined.data,
    startPayload,
  };
}

describe("blitz multijoueur — Socket.IO", () => {
  it("annonce le coup d'envoi à tous les clients, avec une échéance et rien d'autre", async () => {
    const { startPayload } = await startedBlitz();
    expect(Object.keys(startPayload).sort()).toEqual(["endsAt", "found", "serverNow"]);
    expect(startPayload.endsAt - startPayload.serverNow).toBe(SMALL_POOL.durationMs);
    expect(startPayload.found).toEqual([]);
  });

  it("compte les trouvailles de chacun et les publie comme de simples compteurs", async () => {
    const { host, guest } = await startedBlitz();
    const stateOnGuest = new Promise<RoomState>((resolve) => {
      const handler = (state: RoomState) => {
        if (state.players.some((player) => player.score > 0)) {
          guest.off("room:state", handler);
          resolve(state);
        }
      };
      guest.on("room:state", handler);
    });

    const ack = await emit<"blitz:submit", { count: number; found: number[] }>(
      host,
      "blitz:submit",
      { names: [SMALL_POOL_NAMES[0]!, SMALL_POOL_NAMES[1]!] },
    );
    expect(ack).toMatchObject({ ok: true });
    if (!ack.ok) return;
    expect(ack.data.count).toBe(2);

    const state = await stateOnGuest;
    expect(state.players.map((player) => player.score)).toEqual([2, 0]);
    // Le classement en direct ne dit jamais QUOI l'autre a trouvé : le seul champ de
    // score est un nombre, et aucun nom de Pokémon ne transite dans l'état.
    for (const name of SMALL_POOL_NAMES) {
      expect(JSON.stringify(state)).not.toContain(name);
    }
  });

  it("rend au reconnecté sa propre liste, et à lui seul", async () => {
    const { host, guest, session, guestSession } = await startedBlitz();
    await emit(host, "blitz:submit", { names: [SMALL_POOL_NAMES[0]!, SMALL_POOL_NAMES[1]!] });
    await emit(guest, "blitz:submit", { names: [SMALL_POOL_NAMES[5]!] });

    const back = client();
    const restored = once<{ found: number[] }>(back, "blitz:start");
    const ack = await emit(back, "room:rejoin", {
      roomCode: session.roomCode,
      playerId: session.playerId,
      playerToken: session.playerToken,
    });
    expect(ack.ok).toBe(true);
    const payload = await restored;
    expect(payload.found).toHaveLength(2);

    const backGuest = client();
    const restoredGuest = once<{ found: number[] }>(backGuest, "blitz:start");
    await emit(backGuest, "room:rejoin", {
      roomCode: guestSession.roomCode,
      playerId: guestSession.playerId,
      playerToken: guestSession.playerToken,
    });
    expect((await restoredGuest).found).toHaveLength(1);
  });

  it("interdit à un invité de choisir le mode de jeu", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });
    const ack = await emit(guest, "room:mode", {
      mode: "blitz",
      blitz: DEFAULT_BLITZ_SETTINGS,
    });
    expect(ack).toMatchObject({ ok: false, code: "NOT_HOST" });
  });

  it("termine la partie et classe tout le monde quand le pool est épuisé", async () => {
    const { host, guest } = await startedBlitz();
    const ended = once<{ standings: Standing[]; history: unknown[] }>(guest, "game:end");

    // Les deux joueurs remplissent tout le pool ; Léa finit après Mathéo, ce qui la
    // départage derrière lui à égalité de total.
    for (let i = 0; i < SMALL_POOL_NAMES.length; i += 32) {
      await emit(host, "blitz:submit", { names: SMALL_POOL_NAMES.slice(i, i + 32) });
    }
    for (let i = 0; i < SMALL_POOL_NAMES.length; i += 32) {
      await emit(guest, "blitz:submit", { names: SMALL_POOL_NAMES.slice(i, i + 32) });
    }

    const payload = await ended;
    expect(payload.standings.map((s) => ({ nickname: s.nickname, score: s.score }))).toEqual([
      { nickname: "Mathéo", score: SMALL_POOL_NAMES.length },
      { nickname: "Léa", score: SMALL_POOL_NAMES.length },
    ]);
    expect(payload.history).toEqual([]);
  });
});

describe("blitz et limite de débit", () => {
  it("encaisse le rythme réel du client — une fournée par seconde — sans jamais le brider", async () => {
    const { guest } = await startedBlitz();
    // Le client groupe ses trouvailles et n'émet qu'une fournée par seconde
    // (`BLITZ_FLUSH_MS`) : sur la fenêtre de 10 s de la limite, cela fait 10 envois au
    // plus, jointure comprise 11 des 20 événements autorisés.
    for (let i = 0; i < 10; i++) {
      const ack = await emit(guest, "blitz:submit", { names: [SMALL_POOL_NAMES[i]!] });
      expect(ack).toMatchObject({ ok: true });
    }
    expect(guest.connected).toBe(true);
  });

  it("aurait bridé un envoi par Pokémon trouvé, ce que le groupage évite", async () => {
    const { guest } = await startedBlitz();
    // Mesuré : un joueur qui tape à 10 caractères/s enchaîne jusqu'à 21 Pokémon en 10 s
    // sur la génération 1. Un événement par trouvaille, et la limite saute — le joueur
    // est bridé puis, au bout de trois manquements, déconnecté pour avoir bien joué.
    const acks: Ack<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      acks.push(await emit(guest, "blitz:submit", { names: [SMALL_POOL_NAMES[i]!] }));
    }
    expect(acks.filter((ack) => !ack.ok && ack.code === "RATE_LIMITED")).toHaveLength(1);
  });
});
