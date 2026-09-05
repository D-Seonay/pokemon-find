import { randomBytes, randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  ERROR_MESSAGES,
  type ErrorCode,
  type GameSettings,
  type PlayerPublic,
  type RoomState,
  type RoomStatus,
  type RoundResult,
  type Standing,
  validateSettings,
} from "@pkfind/shared";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,16}$/u;

export class RoomError extends Error {
  constructor(readonly code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RoomError";
  }
}

export type RoomTimings = {
  countdownMs: number;
  revealMs: number;
  answerGraceMs: number;
  allAnsweredDelayMs: number;
  /** Réservé aux tests : court-circuite la durée de manche des réglages. */
  roundDurationMsOverride?: number;
};

export type RoomListeners = {
  onState: (state: RoomState) => void;
  onCountdown: (payload: { startsAt: number; serverNow: number }) => void;
  onRoundStart: (payload: {
    roundIndex: number;
    roundCount: number;
    targetId: number;
    endsAt: number;
    serverNow: number;
  }) => void;
  onAnswered: (payload: { playerId: string }) => void;
  onReveal: (payload: {
    roundIndex: number;
    targetId: number;
    results: RoundResult[];
    standings: Standing[];
    revealEndsAt: number;
    serverNow: number;
  }) => void;
  onEnd: (payload: { standings: Standing[]; history: RoundResult[][] }) => void;
};

type Player = {
  id: string;
  token: string;
  nickname: string;
  connected: boolean;
  joinedAt: number;
  score: number;
  totalResponseTimeMs: number;
  answer: { pokemonId: number; responseTimeMs: number } | null;
};

export class Room {
  readonly createdAt = Date.now();
  private players: Player[] = [];
  private hostId: string | null = null;
  private settings: GameSettings = DEFAULT_SETTINGS;
  private state: RoomStatus = "lobby";

  constructor(
    readonly code: string,
    private readonly timings: RoomTimings,
    private readonly listeners: RoomListeners,
    private readonly newGameSeed: () => string = () => `room:${code}:${randomUUID()}`,
  ) {}

  get status(): RoomStatus {
    return this.state;
  }

  get playerCount(): number {
    return this.players.length;
  }

  get connectedCount(): number {
    return this.players.filter((player) => player.connected).length;
  }

  get isEmpty(): boolean {
    return this.players.length === 0;
  }

  addPlayer(rawNickname: string): { playerId: string; playerToken: string; nickname: string } {
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.players.length >= MAX_PLAYERS) throw new RoomError("ROOM_FULL");

    const nickname = this.uniqueNickname(rawNickname.trim());
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(16).toString("hex"),
      nickname,
      connected: true,
      joinedAt: Date.now(),
      score: 0,
      totalResponseTimeMs: 0,
      answer: null,
    };
    this.players.push(player);
    this.hostId ??= player.id;
    this.emitState();
    return { playerId: player.id, playerToken: player.token, nickname };
  }

  rejoin(playerId: string, token: string): boolean {
    const player = this.find(playerId);
    if (player.token !== token) throw new RoomError("INVALID_TOKEN");
    player.connected = true;
    this.hostId ??= player.id;
    this.emitState();
    return true;
  }

  markDisconnected(playerId: string): void {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    player.connected = false;
    this.reassignHostIfNeeded();
    this.emitState();
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((player) => player.id !== playerId);
    if (this.hostId === playerId) this.hostId = null;
    this.reassignHostIfNeeded();
    this.emitState();
  }

  updateSettings(playerId: string, settings: unknown): void {
    this.assertHost(playerId);
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    try {
      this.settings = validateSettings(settings);
    } catch {
      throw new RoomError("INVALID_SETTINGS");
    }
    this.emitState();
  }

  toState(): RoomState {
    return {
      code: this.code,
      status: this.state,
      settings: this.settings,
      players: this.players.map((player): PlayerPublic => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.connected,
        isHost: player.id === this.hostId,
        score: player.score,
        hasAnswered: player.answer !== null,
      })),
      roundIndex: this.currentRoundIndex,
      roundCount: this.settings.roundCount,
    };
  }

  /** Redéfini à la tâche 17. */
  protected currentRoundIndex = -1;

  private uniqueNickname(nickname: string): string {
    if (!NICKNAME_PATTERN.test(nickname)) throw new RoomError("INVALID_NICKNAME");
    const taken = new Set(this.players.map((player) => player.nickname));
    if (!taken.has(nickname)) return nickname;
    for (let suffix = 2; suffix <= MAX_PLAYERS + 1; suffix++) {
      const candidate = `${nickname} (${suffix})`;
      if (!taken.has(candidate)) return candidate;
    }
    throw new RoomError("INVALID_NICKNAME");
  }

  private reassignHostIfNeeded(): void {
    const host = this.players.find((player) => player.id === this.hostId);
    if (host?.connected) return;
    const next = this.players
      .filter((player) => player.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.hostId = next?.id ?? null;
  }

  protected find(playerId: string): Player {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new RoomError("NOT_IN_ROOM");
    return player;
  }

  protected assertHost(playerId: string): void {
    if (playerId !== this.hostId) throw new RoomError("NOT_HOST");
  }

  protected emitState(): void {
    this.listeners.onState(this.toState());
  }
}
