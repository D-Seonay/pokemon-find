import { DEFAULT_BLITZ_SETTINGS, POKEMON, type Standing } from "@pkfind/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomListeners, type RoomTimings } from "./Room.js";

const TIMINGS: RoomTimings = {
  countdownMs: 10,
  revealMs: 10,
  answerGraceMs: 20,
  allAnsweredDelayMs: 5,
  blitzDurationMsOverride: 300,
};

/** Génération 1 uniquement : 151 Pokémon, dont Bulbizarre, Salamèche et Pikachu. */
const SETTINGS = { ...DEFAULT_BLITZ_SETTINGS, generations: [1 as const], durationMs: 60_000 };

let room: Room;
let events: RoomListeners & { onBlitzStart: ReturnType<typeof vi.fn> };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  events = {
    onState: vi.fn(),
    onCountdown: vi.fn(),
    onRoundStart: vi.fn(),
    onAnswered: vi.fn(),
    onReveal: vi.fn(),
    onEnd: vi.fn(),
    onBlitzStart: vi.fn(),
  };
  room = new Room("ABCD", TIMINGS, events);
});

afterEach(() => room.dispose());

/** Ouvre une room en mode blitz avec deux joueurs et lance la partie jusqu'à la phase de jeu. */
async function playing(): Promise<{ host: string; guest: string }> {
  const host = room.addPlayer("Mathéo");
  const guest = room.addPlayer("Léa");
  room.updateMode(host.playerId, "blitz", SETTINGS);
  room.start(host.playerId);
  await wait(TIMINGS.countdownMs + 20);
  return { host: host.playerId, guest: guest.playerId };
}

describe("mode de jeu d'une room", () => {
  it("démarre en classique : ajouter le blitz ne change pas ce qu'on jouait", () => {
    expect(room.toState().gameMode).toBe("classic");
    expect(room.toState().blitzSettings).toEqual(DEFAULT_BLITZ_SETTINGS);
  });

  it("n'accepte le choix du mode que de l'hôte", () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    expect(() => room.updateMode(guest.playerId, "blitz", SETTINGS)).toThrow(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
    room.updateMode(host.playerId, "blitz", SETTINGS);
    expect(room.toState().gameMode).toBe("blitz");
  });

  it("rejette des réglages blitz invalides", () => {
    const host = room.addPlayer("Mathéo");
    expect(() =>
      room.updateMode(host.playerId, "blitz", { generations: [1], durationMs: 42 } as never),
    ).toThrow(expect.objectContaining({ code: "INVALID_SETTINGS" }));
  });

  it("refuse de changer de mode une fois la partie lancée", async () => {
    const { host } = await playing();
    expect(() => room.updateMode(host, "classic", SETTINGS)).toThrow(
      expect.objectContaining({ code: "GAME_IN_PROGRESS" }),
    );
  });
});

describe("partie blitz", () => {
  it("passe par le décompte puis ouvre la phase de jeu avec une échéance", async () => {
    const host = room.addPlayer("Mathéo");
    room.addPlayer("Léa");
    room.updateMode(host.playerId, "blitz", SETTINGS);
    room.start(host.playerId);

    expect(room.status).toBe("countdown");
    expect(events.onCountdown).toHaveBeenCalled();
    expect(events.onBlitzStart).not.toHaveBeenCalled();

    await wait(TIMINGS.countdownMs + 20);
    expect(room.status).toBe("blitz");
    const payload = events.onBlitzStart.mock.calls[0]?.[0] as {
      endsAt: number;
      serverNow: number;
      found: number[];
    };
    expect(payload.endsAt - payload.serverNow).toBe(TIMINGS.blitzDurationMsOverride);
    expect(payload.found).toEqual([]);
  });

  it("compte un Pokémon du pool, nommé en français comme en anglais", async () => {
    const { host, guest } = await playing();
    expect(room.submitBlitz(host, ["bulbizarre"])).toEqual({ count: 1, found: [1] });
    expect(room.submitBlitz(guest, ["Charmander"])).toEqual({ count: 1, found: [4] });
  });

  it("ne compte pas deux fois le même Pokémon, même dans une seule fournée", async () => {
    const { host } = await playing();
    expect(room.submitBlitz(host, ["pikachu", "Pikachu", "pikachu"])).toEqual({
      count: 1,
      found: [25],
    });
    expect(room.submitBlitz(host, ["bulbasaur", "bulbizarre"])).toEqual({ count: 2, found: [1] });
  });

  it("ignore un nom hors du pool : c'est le serveur qui valide, pas le client", async () => {
    const { host } = await playing();
    // Héricendre est de génération 2, la partie porte sur la première.
    expect(room.submitBlitz(host, ["hericendre", "nimportequoi", ""])).toEqual({
      count: 0,
      found: [],
    });
  });

  it("borne la taille d'une fournée plutôt que de traiter tout ce qu'un client envoie", async () => {
    const { host } = await playing();
    const flood = Array.from({ length: 500 }, (_, i) => `bidon-${i}`);
    // Les 32 premiers noms sont examinés, le reste est jeté : « bulbizarre » en 500e
    // position ne compte pas, la fournée honnête n'en contient jamais plus de trois.
    expect(room.submitBlitz(host, [...flood, "bulbizarre"])).toEqual({ count: 0, found: [] });
    expect(room.submitBlitz(host, ["bulbizarre"])).toEqual({ count: 1, found: [1] });
  });

  it("garde à chaque joueur sa propre liste : trouver un Pokémon ne le retire à personne", async () => {
    const { host, guest } = await playing();
    room.submitBlitz(host, ["bulbizarre"]);
    expect(room.submitBlitz(guest, ["bulbizarre"])).toEqual({ count: 1, found: [1] });
    const state = room.toState();
    expect(state.players.map((p) => p.score)).toEqual([1, 1]);
  });

  it("ne diffuse jamais QUELS Pokémon un joueur a trouvés, seulement combien", async () => {
    const { host } = await playing();
    room.submitBlitz(host, ["bulbizarre", "pikachu"]);

    for (const [state] of vi.mocked(events.onState).mock.calls) {
      for (const player of state.players) {
        // Un compteur, jamais une liste : `1` ne dit pas lequel, `[1]` le dirait.
        expect(typeof player.score).toBe("number");
      }
      expect(JSON.stringify(state)).not.toContain("bulbizarre");
    }
    for (const [payload] of events.onBlitzStart.mock.calls as [{ found: number[] }][]) {
      expect(payload.found).toEqual([]);
    }
  });

  it("refuse une soumission une fois la partie terminée", async () => {
    const { host } = await playing();
    await wait(TIMINGS.blitzDurationMsOverride! + TIMINGS.answerGraceMs + 40);
    expect(room.status).toBe("finished");
    expect(() => room.submitBlitz(host, ["bulbizarre"])).toThrow(
      expect.objectContaining({ code: "BLITZ_CLOSED" }),
    );
  });

  it("classe par nombre de trouvailles, puis par qui a atteint ce total le premier", async () => {
    const { host, guest } = await playing();
    // Léa trouve ses deux Pokémon tout de suite, Mathéo les siens plus tard : à égalité
    // de total, c'est la première arrivée qui prime.
    room.submitBlitz(guest, ["bulbizarre", "salameche"]);
    await wait(80);
    room.submitBlitz(host, ["pikachu", "carapuce"]);

    await wait(TIMINGS.blitzDurationMsOverride! + TIMINGS.answerGraceMs + 40);
    const payload = vi.mocked(events.onEnd).mock.calls[0]?.[0];
    const standings = payload?.standings as Standing[];
    expect(standings.map((s) => ({ id: s.playerId, rank: s.rank, score: s.score }))).toEqual([
      { id: guest, rank: 1, score: 2 },
      { id: host, rank: 2, score: 2 },
    ]);
    // Une partie blitz n'a pas de manches : l'historique est vide, et le dit.
    expect(payload?.history).toEqual([]);
  });

  it("laisse la partie aller à son terme quand un joueur se déconnecte", async () => {
    const { host, guest } = await playing();
    room.markDisconnected(guest);
    expect(room.status).toBe("blitz");
    room.submitBlitz(host, ["bulbizarre"]);
    await wait(TIMINGS.blitzDurationMsOverride! + TIMINGS.answerGraceMs + 40);
    expect(room.status).toBe("finished");
    expect(events.onEnd).toHaveBeenCalled();
  });

  it("s'arrête avant l'heure quand tous les joueurs connectés ont le pool complet", async () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    room.updateMode(host.playerId, "blitz", SETTINGS);
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    // Léa se déconnecte : Mathéo est le seul joueur connecté, donc le seul dont le pool
    // complet peut clore la partie. Un déconnecté ne doit bloquer personne.
    room.markDisconnected(guest.playerId);

    const names = POKEMON.filter((p) => p.generation === 1).map((p) => p.nameFr);
    for (let i = 0; i < names.length; i += 16)
      room.submitBlitz(host.playerId, names.slice(i, i + 16));

    expect(room.status).toBe("finished");
    expect(events.onEnd).toHaveBeenCalled();
  });
});

describe("reconnexion en pleine partie blitz", () => {
  it("rend au reconnecté sa propre liste, et rien de celle des autres", async () => {
    const { host, guest } = await playing();
    room.submitBlitz(host, ["bulbizarre", "pikachu"]);
    room.submitBlitz(guest, ["salameche"]);

    const snapshot = room.snapshotForRejoin(host);
    expect(snapshot.kind).toBe("blitz");
    if (snapshot.kind !== "blitz") throw new Error("instantané inattendu");
    expect(snapshot.payload.found).toEqual([1, 25]);
    expect(snapshot.payload.endsAt).toBeGreaterThan(snapshot.payload.serverNow);

    const other = room.snapshotForRejoin(guest);
    if (other.kind !== "blitz") throw new Error("instantané inattendu");
    expect(other.payload.found).toEqual([4]);
  });

  it("rend le classement final à qui se reconnecte après la fin", async () => {
    const { host } = await playing();
    room.submitBlitz(host, ["bulbizarre"]);
    await wait(TIMINGS.blitzDurationMsOverride! + TIMINGS.answerGraceMs + 40);
    const snapshot = room.snapshotForRejoin(host);
    expect(snapshot.kind).toBe("end");
  });
});
