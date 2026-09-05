import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS, Room, RoomError, type RoomListeners, type RoomTimings } from "./Room.js";

const TIMINGS: RoomTimings = {
  countdownMs: 20,
  revealMs: 20,
  answerGraceMs: 0,
  allAnsweredDelayMs: 5,
};

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

let room: Room;

beforeEach(() => {
  room = new Room("ABCD", TIMINGS, listeners());
});

describe("lobby", () => {
  it("démarre vide en lobby", () => {
    const state = room.toState();
    expect(state).toMatchObject({ code: "ABCD", status: "lobby", roundIndex: -1 });
    expect(state.players).toEqual([]);
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("fait du premier arrivant l'hôte", () => {
    const first = room.addPlayer("Mathéo");
    room.addPlayer("Léa");
    const state = room.toState();
    expect(state.players[0]?.id).toBe(first.playerId);
    expect(state.players[0]?.isHost).toBe(true);
    expect(state.players[1]?.isHost).toBe(false);
  });

  it("valide le pseudo", () => {
    expect(() => room.addPlayer("a")).toThrow(RoomError);
    expect(() => room.addPlayer("x".repeat(17))).toThrow(RoomError);
    expect(() => room.addPlayer("  ")).toThrow(RoomError);
    expect(room.addPlayer("  Mathéo  ").nickname).toBe("Mathéo");
  });

  it("suffixe un pseudo déjà pris", () => {
    room.addPlayer("Léa");
    expect(room.addPlayer("Léa").nickname).toBe("Léa (2)");
    expect(room.addPlayer("Léa").nickname).toBe("Léa (3)");
  });

  it("refuse un neuvième joueur", () => {
    for (let i = 0; i < MAX_PLAYERS; i++) room.addPlayer(`Joueur${i}`);
    expect(() => room.addPlayer("DeTrop")).toThrow(expect.objectContaining({ code: "ROOM_FULL" }));
  });

  it("n'accepte les réglages que de l'hôte, et seulement en lobby", () => {
    const host = room.addPlayer("Mathéo");
    const guest = room.addPlayer("Léa");
    const settings = { ...DEFAULT_SETTINGS, roundCount: 5 as const };
    expect(() => room.updateSettings(guest.playerId, settings)).toThrow(
      expect.objectContaining({ code: "NOT_HOST" }),
    );
    room.updateSettings(host.playerId, settings);
    expect(room.toState().settings.roundCount).toBe(5);
  });

  it("rejette des réglages invalides", () => {
    const host = room.addPlayer("Mathéo");
    expect(() => room.updateSettings(host.playerId, { generations: [] } as never)).toThrow(
      expect.objectContaining({ code: "INVALID_SETTINGS" }),
    );
  });

  it("marque un joueur hors ligne sans le supprimer", () => {
    const player = room.addPlayer("Mathéo");
    room.markDisconnected(player.playerId);
    expect(room.toState().players[0]?.connected).toBe(false);
    expect(room.playerCount).toBe(1);
    expect(room.connectedCount).toBe(0);
  });

  it("transfère l'hôte au joueur connecté le plus ancien", () => {
    const host = room.addPlayer("Mathéo");
    const second = room.addPlayer("Léa");
    room.addPlayer("Tom");
    room.markDisconnected(host.playerId);
    expect(room.toState().players.find((p) => p.isHost)?.id).toBe(second.playerId);
  });

  it("ne redonne pas l'hôte à celui qui revient", () => {
    const host = room.addPlayer("Mathéo");
    const second = room.addPlayer("Léa");
    room.markDisconnected(host.playerId);
    expect(room.rejoin(host.playerId, host.playerToken)).toBe(true);
    expect(room.toState().players.find((p) => p.isHost)?.id).toBe(second.playerId);
  });

  it("refuse une reconnexion avec un mauvais jeton", () => {
    const player = room.addPlayer("Mathéo");
    room.markDisconnected(player.playerId);
    expect(() => room.rejoin(player.playerId, "mauvais")).toThrow(
      expect.objectContaining({ code: "INVALID_TOKEN" }),
    );
  });

  it("signale une room vide", () => {
    const player = room.addPlayer("Mathéo");
    expect(room.isEmpty).toBe(false);
    room.removePlayer(player.playerId);
    expect(room.isEmpty).toBe(true);
  });
});
