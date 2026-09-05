import { DEFAULT_SETTINGS, buildPool, pickTargets, rngFromSeed } from "@pkfind/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomListeners, type RoomTimings } from "./Room.js";

const SEED = "room:ABCD:test";
const TIMINGS: RoomTimings = {
  countdownMs: 10,
  revealMs: 10,
  answerGraceMs: 0,
  allAnsweredDelayMs: 5,
  roundDurationMsOverride: 200,
};

const targets = pickTargets(
  buildPool(DEFAULT_SETTINGS.generations).ids,
  DEFAULT_SETTINGS.roundCount,
  rngFromSeed(SEED),
);

let room: Room;
let events: RoomListeners;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  events = {
    onState: vi.fn(),
    onCountdown: vi.fn(),
    onRoundStart: vi.fn(),
    onAnswered: vi.fn(),
    onReveal: vi.fn(),
    onEnd: vi.fn(),
  };
  room = new Room("ABCD", TIMINGS, events, () => SEED);
});

afterEach(() => room.dispose());

function seat(nickname: string) {
  return room.addPlayer(nickname);
}

describe("lobby", () => {
  it("refuse de démarrer à moins de deux joueurs connectés", () => {
    const host = room.addPlayer("Mathéo");
    expect(() => room.start(host.playerId)).toThrow(
      expect.objectContaining({ code: "NOT_ENOUGH_PLAYERS" }),
    );
  });
});

describe("boucle de jeu", () => {
  it("passe par le décompte puis ouvre la première manche", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    expect(room.status).toBe("countdown");
    expect(events.onCountdown).toHaveBeenCalled();

    await wait(TIMINGS.countdownMs + 20);
    expect(room.status).toBe("round");
    expect(events.onRoundStart).toHaveBeenCalledWith(
      expect.objectContaining({ roundIndex: 0, targetId: targets[0], roundCount: 10 }),
    );
    expect(events.onState).toHaveBeenCalledWith(
      expect.objectContaining({ status: "round", roundIndex: 0 }),
    );
  });

  it("n'expose jamais le nom ni le sprite de la cible à l'ouverture d'une manche", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    const payload = vi.mocked(events.onRoundStart).mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {})).toEqual([
      "roundIndex",
      "roundCount",
      "targetId",
      "endsAt",
      "serverNow",
    ]);
  });

  it("note les réponses et révèle dès que tout le monde a répondu", async () => {
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);

    room.answer(host.playerId, 0, targets[0]!);
    expect(events.onAnswered).toHaveBeenCalledWith({ playerId: host.playerId });
    room.answer(guest.playerId, 0, targets[0]! === 1 ? 2 : 1);

    await wait(TIMINGS.allAnsweredDelayMs + 20);
    const reveal = vi.mocked(events.onReveal).mock.calls[0]?.[0];
    expect(reveal?.targetId).toBe(targets[0]);
    expect(reveal?.results.find((r) => r.playerId === host.playerId)?.points).toBe(1000);
    expect(reveal?.standings[0]?.playerId).toBe(host.playerId);
  });

  it("compte zéro pour un joueur qui ne répond pas", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    room.answer(host.playerId, 0, targets[0]!);
    await wait(TIMINGS.roundDurationMsOverride! + 40);
    const reveal = vi.mocked(events.onReveal).mock.calls[0]?.[0];
    const absent = reveal?.results.find((r) => r.playerId !== host.playerId);
    expect(absent).toMatchObject({ pokemonId: null, gap: null, points: 0, responseTimeMs: null });
  });

  it("rejette une deuxième réponse, un mauvais index et un Pokémon hors pool", async () => {
    const host = seat("Mathéo");
    seat("Léa");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);

    room.answer(host.playerId, 0, targets[0]!);
    expect(() => room.answer(host.playerId, 0, 5)).toThrow(
      expect.objectContaining({ code: "ALREADY_ANSWERED" }),
    );
    expect(() => room.answer(host.playerId, 7, 5)).toThrow(
      expect.objectContaining({ code: "ROUND_CLOSED" }),
    );
  });

  it("accepte une réponse après la durée nominale mais dans la tolérance de latence", async () => {
    const graceTimings: RoomTimings = {
      countdownMs: 10,
      revealMs: 10,
      answerGraceMs: 100,
      allAnsweredDelayMs: 5,
      roundDurationMsOverride: 40,
    };
    const graceEvents: RoomListeners = {
      onState: vi.fn(),
      onCountdown: vi.fn(),
      onRoundStart: vi.fn(),
      onAnswered: vi.fn(),
      onReveal: vi.fn(),
      onEnd: vi.fn(),
    };
    const graceRoom = new Room("EFGH", graceTimings, graceEvents, () => SEED);
    const host = graceRoom.addPlayer("Mathéo");
    graceRoom.addPlayer("Léa");
    graceRoom.start(host.playerId);
    await wait(graceTimings.countdownMs + 20);
    // Attend au-delà de la durée nominale de la manche, mais toujours dans la fenêtre de grâce.
    await wait(graceTimings.roundDurationMsOverride! + 20);

    expect(() => graceRoom.answer(host.playerId, 0, targets[0]!)).not.toThrow();
    expect(graceRoom.status).toBe("round");

    graceRoom.dispose();
  });

  it("rejette un Pokémon hors du pool actif", async () => {
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, { ...DEFAULT_SETTINGS, generations: [1] });
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    expect(() => room.answer(guest.playerId, 0, 448)).toThrow(
      expect.objectContaining({ code: "NOT_IN_POOL" }),
    );
  });

  it("enchaîne les manches puis termine la partie", async () => {
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, settings);
    room.start(host.playerId);

    for (let index = 0; index < settings.roundCount; index++) {
      await wait(TIMINGS.countdownMs + 20);
      const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
      room.answer(host.playerId, index, started!.targetId);
      room.answer(guest.playerId, index, started!.targetId);
      await wait(TIMINGS.allAnsweredDelayMs + TIMINGS.revealMs + 30);
    }

    expect(room.status).toBe("finished");
    const end = vi.mocked(events.onEnd).mock.calls[0]?.[0];
    expect(end?.history).toHaveLength(settings.roundCount);
    expect(end?.standings).toHaveLength(2);
    expect(end?.standings[0]?.score).toBe(5000);
  });

  it("départage deux scores égaux au temps de réponse cumulé", async () => {
    const host = seat("Rapide");
    const guest = seat("Lent");
    room.start(host.playerId);
    await wait(TIMINGS.countdownMs + 20);
    const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
    room.answer(host.playerId, 0, started!.targetId);
    await wait(20);
    room.answer(guest.playerId, 0, started!.targetId);
    await wait(TIMINGS.allAnsweredDelayMs + 20);

    const reveal = vi.mocked(events.onReveal).mock.calls.at(-1)?.[0];
    expect(reveal?.standings[0]?.playerId).toBe(host.playerId);
    expect(reveal?.standings[0]?.rank).toBe(1);
    expect(reveal?.standings[1]?.playerId).toBe(guest.playerId);
    expect(reveal?.standings[1]?.rank).toBe(2);
  });

  it("revient au lobby avec les scores remis à zéro sur relance", async () => {
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    const host = seat("Mathéo");
    const guest = seat("Léa");
    room.updateSettings(host.playerId, settings);
    room.start(host.playerId);
    for (let index = 0; index < settings.roundCount; index++) {
      await wait(TIMINGS.countdownMs + 20);
      const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
      room.answer(host.playerId, index, started!.targetId);
      room.answer(guest.playerId, index, started!.targetId);
      await wait(TIMINGS.allAnsweredDelayMs + TIMINGS.revealMs + 30);
    }
    room.playAgain(host.playerId);
    expect(room.status).toBe("lobby");
    expect(room.toState().players.every((player) => player.score === 0)).toBe(true);
    expect(room.toState().roundIndex).toBe(-1);
  });
});
