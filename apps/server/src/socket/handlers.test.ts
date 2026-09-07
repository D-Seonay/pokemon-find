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

/**
 * Attend le premier `room:state` dont le `status` correspond, en ignorant ceux qui
 * précèdent (une manche produit plusieurs diffusions — réponses, révélation — avant
 * d'atteindre l'état recherché). Plus robuste qu'un simple `once` quand on ne peut pas
 * garantir combien de diffusions intermédiaires un socket donné aura déjà reçues.
 */
function untilStatus(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  status: RoomState["status"],
): Promise<RoomState> {
  return new Promise((resolve) => {
    const handler = (state: RoomState) => {
      if (state.status !== status) return;
      socket.off("room:state", handler);
      resolve(state);
    };
    socket.on("room:state", handler);
  });
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

  it("restaure la manche en cours pour un joueur qui se reconnecte pendant une manche", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    await emit(host, "room:start", {});
    const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");

    guest.close();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const back = client();
    const restoredRoundStart = once<{ roundIndex: number; targetId: number }>(back, "round:start");
    const ack = await emit<"room:rejoin", { state: RoomState }>(back, "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
    });
    expect(ack.ok).toBe(true);

    const restored = await restoredRoundStart;
    expect(restored.targetId).toBe(started.targetId);
    expect(restored.roundIndex).toBe(started.roundIndex);
  });

  it("restaure la révélation pour un joueur qui se reconnecte pendant la révélation", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    const joined = await emit<"room:join", JoinPayload>(guest, "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Léa",
    });
    if (!joined.ok) throw new Error("jointure échouée");

    // Connecté à l'avance : la fenêtre de révélation ne dure que 100 ms dans ces tests
    // (ROUND_REVEAL_MS ci-dessus), la reconnexion ne doit donc pas payer le coût de la
    // poignée de main WebSocket au moment critique.
    const back = client();
    await new Promise<void>((resolve) => {
      if (back.connected) resolve();
      else back.once("connect", () => resolve());
    });

    type RevealPayload = {
      roundIndex: number;
      target: { id: number; nameFr: string };
      standings: Array<{ playerId: string; score: number }>;
    };
    const hostReveal = once<RevealPayload>(host, "round:reveal");
    await emit(host, "room:start", {});
    const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
    await emit(host, "round:answer", {
      roundIndex: started.roundIndex,
      pokemonId: started.targetId,
    });
    await emit(guest, "round:answer", {
      roundIndex: started.roundIndex,
      pokemonId: started.targetId === 1 ? 2 : 1,
    });

    const restoredReveal = once<RevealPayload>(back, "round:reveal");
    const reveal = await hostReveal;
    const ack = await emit<"room:rejoin", { state: RoomState }>(back, "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
    });
    expect(ack.ok).toBe(true);

    const restored = await restoredReveal;
    // Vérifie que la révélation restaurée correspond bien à la manche qui vient de se
    // terminer (et pas, par exemple, à la manche suivante à cause d'un décalage entre
    // `currentRoundIndex` et `history`) : le numéro de manche ET le Pokémon cible doivent
    // coïncider avec ce que l'hôte a reçu.
    expect(restored.roundIndex).toBe(started.roundIndex);
    expect(restored.target.id).toBe(started.targetId);
    expect(typeof restored.target.nameFr).toBe("string");
    expect(restored.standings).toEqual(reveal.standings);
  });

  it("restaure le classement final pour un joueur qui se reconnecte après la fin de partie", async () => {
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

    type EndPayload = {
      standings: Array<{ playerId: string; score: number }>;
      history: unknown[];
    };
    const ended = once<EndPayload>(host, "game:end");
    await emit(host, "room:start", {});

    for (let index = 0; index < 5; index++) {
      const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
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

    const back = client();
    const restoredEnd = once<EndPayload>(back, "game:end");
    const ack = await emit<"room:rejoin", { state: RoomState }>(back, "room:rejoin", {
      roomCode: created.data.roomCode,
      playerId: joined.data.playerId,
      playerToken: joined.data.playerToken,
    });
    expect(ack.ok).toBe(true);

    const restored = await restoredEnd;
    expect(restored.standings).toEqual(result.standings);
    expect(restored.history).toEqual(result.history);
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

  it("quitte la room et cesse de recevoir ses diffusions", async () => {
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

    const leaveAck = await emit(guest, "room:leave", {});
    expect(leaveAck).toMatchObject({ ok: true });

    let receivedAfterLeave = false;
    guest.on("room:state", () => {
      receivedAfterLeave = true;
    });

    const nextHostState = once<RoomState>(host, "room:state");
    await emit(client(), "room:join", {
      roomCode: created.data.roomCode,
      nickname: "Sacha",
    });
    await nextHostState;

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(receivedAfterLeave).toBe(false);
  });

  it("un payload non-objet sur room:join ne fait pas planter le serveur", async () => {
    const ack = await emit(client(), "room:join", null);
    expect(ack).toMatchObject({ ok: false, code: "INTERNAL" });

    // Le serveur doit rester vivant : une requête normale doit encore aboutir après ça.
    const followUp = await emit<"room:create", JoinPayload>(client(), "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    expect(followUp.ok).toBe(true);
  });

  it("un envoi sans accusé de réception ne fait pas planter le serveur", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: DEFAULT_SETTINGS,
    });
    if (!created.ok) throw new Error("création échouée");

    // Émission volontairement sans callback d'accusé de réception, comme le ferait un
    // client malveillant (ou une simple ligne dans la console du navigateur).
    (host.emit as (event: "room:start", input: unknown) => void)("room:start", {});

    // Le serveur doit rester vivant. On sonde jusqu'à obtenir une réponse normale plutôt
    // que de dormir un temps fixe : un délai fixe confond une machine momentanément lente
    // (poignée de main WebSocket froide, GC, CI chargée) avec un serveur mort, ce qui a
    // produit un run flaky sur 32. Avec le sondage, le seul moyen d'échec restant est un
    // serveur réellement mort — exactement ce que ce test doit prouver.
    await expect
      .poll(
        async () => {
          const followUp = await emit<"room:create", JoinPayload>(client(), "room:create", {
            nickname: "Léa",
            settings: DEFAULT_SETTINGS,
          });
          return followUp.ok;
        },
        { timeout: 15_000, interval: 100 },
      )
      .toBe(true);
  }, 20_000);

  it("expose à tous les joueurs le mode de relecture choisi par l'hôte", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, generations: [1], roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });

    await emit(host, "room:start", {});
    for (let index = 0; index < 5; index++) {
      const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
      await emit(host, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId,
      });
      await emit(guest, "round:answer", {
        roundIndex: started.roundIndex,
        pokemonId: started.targetId === 1 ? 2 : 1,
      });
    }
    // La dernière manche diffuse encore un `room:state` "reveal" avant celui "finished" : on
    // attend explicitement ce dernier côté invité, pour ne pas confondre l'un des deux avec
    // celui qui suivra `room:playAgain`.
    const guestSeesFinished = untilStatus(guest, "finished");
    await once(host, "game:end");
    await guestSeesFinished;

    const guestSeesLobby = untilStatus(guest, "lobby");
    const replayAck = await emit<"room:playAgain", { state: RoomState }>(host, "room:playAgain", {
      sameSeries: true,
    });
    expect(replayAck.ok).toBe(true);
    if (replayAck.ok) expect(replayAck.data.state.replayMode).toBe("same");

    const stateSeenByGuest = await guestSeesLobby;
    expect(stateSeenByGuest.replayMode).toBe("same");
  });

  it("rejoue la série identique de numéros après room:playAgain avec sameSeries", async () => {
    const host = client();
    const created = await emit<"room:create", JoinPayload>(host, "room:create", {
      nickname: "Mathéo",
      settings: { ...DEFAULT_SETTINGS, generations: [1], roundCount: 5 },
    });
    if (!created.ok) throw new Error("création échouée");
    const guest = client();
    await emit(guest, "room:join", { roomCode: created.data.roomCode, nickname: "Léa" });

    async function playGame(): Promise<number[]> {
      const targets: number[] = [];
      const ended = once(host, "game:end");
      await emit(host, "room:start", {});
      for (let index = 0; index < 5; index++) {
        const started = await once<{ roundIndex: number; targetId: number }>(host, "round:start");
        targets.push(started.targetId);
        await emit(host, "round:answer", {
          roundIndex: started.roundIndex,
          pokemonId: started.targetId,
        });
        await emit(guest, "round:answer", {
          roundIndex: started.roundIndex,
          pokemonId: started.targetId === 1 ? 2 : 1,
        });
      }
      await ended;
      return targets;
    }

    const firstSeries = await playGame();

    const replayAck = await emit<"room:playAgain", { state: RoomState }>(host, "room:playAgain", {
      sameSeries: true,
    });
    expect(replayAck.ok).toBe(true);

    const secondSeries = await playGame();
    expect(secondSeries).toEqual(firstSeries);
  }, 15_000);

  it("déconnecte un socket après trois violations de la limite de débit", async () => {
    const host = client();
    const disconnected = new Promise<void>((resolve) => {
      host.on("disconnect", () => resolve());
    });

    for (let index = 0; index < 30; index++) {
      host.emit("room:leave", {}, () => undefined);
    }

    await disconnected;
    expect(host.connected).toBe(false);
  });
});
