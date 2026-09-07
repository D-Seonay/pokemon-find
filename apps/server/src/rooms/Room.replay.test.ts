import { DEFAULT_SETTINGS, buildPool, pickTargets, rngFromSeed } from "@pkfind/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomListeners, type RoomTimings } from "./Room.js";

/**
 * §8 : « room:playAgain » ramène au lobby, et jusqu'ici, le prochain « room:start » tire
 * systématiquement une nouvelle graine (`room:{code}:{gameId}` avec un `gameId` frais).
 * Cette suite couvre le nouveau mode « même série » : l'hôte peut choisir, en relançant, de
 * rejouer exactement les mêmes cibles, dans le même ordre, en réutilisant la graine de la
 * partie qui vient de se terminer plutôt que d'en tirer une nouvelle.
 */

const TIMINGS: RoomTimings = {
  countdownMs: 10,
  revealMs: 10,
  answerGraceMs: 0,
  allAnsweredDelayMs: 5,
  roundDurationMsOverride: 100,
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function listeners(): RoomListeners {
  return {
    onState: vi.fn(),
    onCountdown: vi.fn(),
    onRoundStart: vi.fn(),
    onAnswered: vi.fn(),
    onReveal: vi.fn(),
    onEnd: vi.fn(),
  };
}

const SETTINGS = { ...DEFAULT_SETTINGS, generations: [1] as const, roundCount: 5 as const };
const SEED_A = "room:ABCD:game-a";
const SEED_B = "room:ABCD:game-b";
const TARGETS_A = pickTargets(
  buildPool(SETTINGS.generations).ids,
  SETTINGS.roundCount,
  rngFromSeed(SEED_A),
);
const TARGETS_B = pickTargets(
  buildPool(SETTINGS.generations).ids,
  SETTINGS.roundCount,
  rngFromSeed(SEED_B),
);

/** Deux graines distinctes et connues à l'avance, une par partie effectivement démarrée. */
function twoSeeds(): () => string {
  const seeds = [SEED_A, SEED_B];
  let index = 0;
  return () => seeds[Math.min(index++, seeds.length - 1)]!;
}

async function playGame(
  room: Room,
  events: RoomListeners,
  hostId: string,
  guestId: string,
): Promise<void> {
  for (let index = 0; index < SETTINGS.roundCount; index++) {
    await wait(TIMINGS.countdownMs + 20);
    const started = vi.mocked(events.onRoundStart).mock.calls.at(-1)?.[0];
    room.answer(hostId, index, started!.targetId);
    room.answer(guestId, index, started!.targetId);
    await wait(TIMINGS.allAnsweredDelayMs + TIMINGS.revealMs + 30);
  }
}

function targetsSeenBy(events: RoomListeners): number[] {
  return vi.mocked(events.onRoundStart).mock.calls.map((call) => call[0].targetId);
}

let room: Room;
let events: RoomListeners;

beforeEach(() => {
  events = listeners();
  room = new Room("ABCD", TIMINGS, events, twoSeeds());
  room.updateSettingsUnchecked(SETTINGS);
});

afterEach(() => room.dispose());

describe("relecture de la même série", () => {
  it("n'a pas de mode de relecture avant la première partie", () => {
    expect(room.toState().replayMode).toBeNull();
  });

  it("tire une nouvelle série par défaut à la relance", async () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);
    expect(room.status).toBe("finished");

    room.playAgain(host.playerId, false);
    expect(room.toState().replayMode).toBe("new");

    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);

    expect(targetsSeenBy(events)).toEqual([...TARGETS_A, ...TARGETS_B]);
  });

  it("rejoue la série identique quand sameSeries est demandé", async () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);
    expect(room.status).toBe("finished");

    room.playAgain(host.playerId, true);
    expect(room.toState().replayMode).toBe("same");

    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);

    expect(targetsSeenBy(events)).toEqual([...TARGETS_A, ...TARGETS_A]);
  });

  it("annule le mode « même série » si les réglages changent avant la relance", async () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);

    room.playAgain(host.playerId, true);
    expect(room.toState().replayMode).toBe("same");

    room.updateSettings(host.playerId, SETTINGS);
    expect(room.toState().replayMode).toBe("new");
  });

  it("garde le comportement historique de playAgain sans argument (nouvelle série)", async () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    room.start(host.playerId);
    await playGame(room, events, host.playerId, guest.playerId);

    room.playAgain(host.playerId);
    expect(room.toState().replayMode).toBe("new");
  });
});
