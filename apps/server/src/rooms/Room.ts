import { randomBytes, randomUUID } from "node:crypto";
import {
  buildPool,
  DEFAULT_SETTINGS,
  ERROR_MESSAGES,
  type ErrorCode,
  type GameSettings,
  gapBetween,
  pickTargets,
  type PlayerPublic,
  type Pool,
  rngFromSeed,
  type RoomState,
  type RoomStatus,
  type RoundResult,
  scoreForAnswer,
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

/**
 * Ce qu'il faut renvoyer à un socket qui vient de se reconnecter (`room:rejoin`) pour
 * qu'il retrouve l'écran de jeu courant plutôt que le lobby : `room:state` seul ne
 * transporte ni le numéro de la manche en cours, ni le résultat de la révélation, ni le
 * classement final. `endsAt`/`revealEndsAt`/`serverNow` sont ceux à l'instant présent,
 * pas ceux de l'émission d'origine, pour que le compte à rebours du client reconnecté
 * démarre juste.
 */
export type RejoinSnapshot =
  | {
      kind: "round";
      payload: {
        roundIndex: number;
        roundCount: number;
        targetId: number;
        endsAt: number;
        serverNow: number;
      };
    }
  | {
      kind: "reveal";
      payload: {
        roundIndex: number;
        targetId: number;
        results: RoundResult[];
        standings: Standing[];
        revealEndsAt: number;
        serverNow: number;
      };
    }
  | { kind: "end"; payload: { standings: Standing[]; history: RoundResult[][] } }
  | { kind: "none" };

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
  private pool: Pool = buildPool(DEFAULT_SETTINGS.generations);
  private targets: number[] = [];
  private history: RoundResult[][] = [];
  private roundStartedAt = 0;
  private revealStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  protected currentRoundIndex = -1;
  /** Graine de la dernière partie effectivement démarrée ; `null` tant qu'aucune ne l'a été. */
  private lastGameSeed: string | null = null;
  /** Mode retenu par `room:playAgain` pour la prochaine partie. Voir `RoomState.replayMode`. */
  private replayMode: "new" | "same" | null = null;

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
    // §8.7 : plus personne de connecté en pleine partie (tout le monde a fermé l'onglet ou
    // perdu sa connexion) — les timers de manche/révélation ne doivent pas continuer à
    // tourner dans le vide, et quiconque revient dans la fenêtre de grâce doit retrouver le
    // lobby, pas une partie terminée avec un classement vide. `resetToLobby()` fait déjà son
    // propre `emitState()`, d'où le retour anticipé plutôt qu'un double envoi.
    if (this.connectedCount === 0 && this.state !== "lobby") {
      this.resetToLobby();
      return;
    }
    this.emitState();
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((player) => player.id !== playerId);
    if (this.hostId === playerId) this.hostId = null;
    this.reassignHostIfNeeded();
    if (this.connectedCount === 0 && this.state !== "lobby") {
      this.resetToLobby();
      return;
    }
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
    // Changer les réglages (générations, notamment) change le pool sur lequel `pickTargets`
    // tire : rejouer la graine précédente ne reproduirait plus la même série. On retombe
    // donc sur une série neuve plutôt que de tenir une promesse qu'on ne peut plus honorer.
    if (this.replayMode === "same") this.replayMode = "new";
    this.emitState();
  }

  /** Applique des réglages à la création, avant qu'un hôte n'existe. */
  updateSettingsUnchecked(settings: unknown): void {
    try {
      this.settings = validateSettings(settings);
    } catch {
      throw new RoomError("INVALID_SETTINGS");
    }
  }

  isConnected(playerId: string): boolean {
    return this.players.some((player) => player.id === playerId && player.connected);
  }

  start(playerId: string): void {
    this.assertHost(playerId);
    if (this.state !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.connectedCount < MIN_PLAYERS_TO_START) throw new RoomError("NOT_ENOUGH_PLAYERS");

    this.pool = buildPool(this.settings.generations);
    // Rejoue la graine de la partie précédente si l'hôte a choisi "même série" ; en tire une
    // nouvelle sinon (comportement historique). `lastGameSeed` ne peut être `null` ici que si
    // `replayMode` vaut "same" par un chemin qui contournerait `playAgain` : on retombe alors
    // sur une graine neuve plutôt que de planter.
    const seed =
      this.replayMode === "same" && this.lastGameSeed !== null
        ? this.lastGameSeed
        : this.newGameSeed();
    this.lastGameSeed = seed;
    this.targets = pickTargets(this.pool.ids, this.settings.roundCount, rngFromSeed(seed));
    this.history = [];
    this.currentRoundIndex = -1;
    for (const player of this.players) {
      player.score = 0;
      player.totalResponseTimeMs = 0;
      player.answer = null;
    }

    this.state = "countdown";
    const now = Date.now();
    this.listeners.onCountdown({ startsAt: now + this.timings.countdownMs, serverNow: now });
    this.emitState();
    this.schedule(() => this.openRound(0), this.timings.countdownMs);
  }

  answer(playerId: string, roundIndex: number, pokemonId: number): void {
    const player = this.find(playerId);
    if (this.state !== "round" || roundIndex !== this.currentRoundIndex) {
      throw new RoomError("ROUND_CLOSED");
    }
    if (player.answer !== null) throw new RoomError("ALREADY_ANSWERED");
    if (!this.pool.ids.includes(pokemonId)) throw new RoomError("NOT_IN_POOL");

    const elapsed = Date.now() - this.roundStartedAt;
    if (elapsed > this.roundDurationMs + this.timings.answerGraceMs) {
      throw new RoomError("ROUND_CLOSED");
    }

    player.answer = { pokemonId, responseTimeMs: Math.min(elapsed, this.roundDurationMs) };
    this.listeners.onAnswered({ playerId });
    this.emitState();

    const connected = this.players.filter((candidate) => candidate.connected);
    if (connected.length > 0 && connected.every((candidate) => candidate.answer !== null)) {
      this.schedule(() => this.closeRound(), this.timings.allAnsweredDelayMs);
    }
  }

  /**
   * `sameSeries` : rejoue la série de cibles de la partie qui vient de se terminer (même
   * graine, donc mêmes numéros dans le même ordre) plutôt que d'en tirer une nouvelle.
   * Toujours possible ici : atteindre l'état `finished` exige d'avoir déjà démarré une
   * partie, donc d'avoir déjà une graine à rejouer.
   */
  playAgain(playerId: string, sameSeries = false): void {
    this.assertHost(playerId);
    if (this.state !== "finished") throw new RoomError("GAME_IN_PROGRESS");
    this.replayMode = sameSeries ? "same" : "new";
    this.resetToLobby();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
      replayMode: this.replayMode,
    };
  }

  /**
   * Ce qu'un socket qui vient de se reconnaître (`room:rejoin`) doit recevoir en plus de
   * `room:state` pour retrouver l'écran de jeu courant. Ne transporte jamais le Pokémon
   * cible tant que la manche est en cours : seul le numéro (`targetId`) sort d'ici,
   * exactement comme `round:start` — la résolution du Pokémon reste le travail de
   * l'appelant, au moment de la révélation.
   */
  snapshotForRejoin(): RejoinSnapshot {
    const now = Date.now();
    if (this.state === "round") {
      return {
        kind: "round",
        payload: {
          roundIndex: this.currentRoundIndex,
          roundCount: this.targets.length,
          targetId: this.targets[this.currentRoundIndex]!,
          endsAt: this.roundStartedAt + this.roundDurationMs,
          serverNow: now,
        },
      };
    }
    if (this.state === "reveal") {
      const results = this.history[this.currentRoundIndex]!;
      return {
        kind: "reveal",
        payload: {
          roundIndex: this.currentRoundIndex,
          targetId: this.targets[this.currentRoundIndex]!,
          results: [...results].sort((a, b) => b.points - a.points),
          standings: this.standings(),
          revealEndsAt: this.revealStartedAt + this.timings.revealMs,
          serverNow: now,
        },
      };
    }
    if (this.state === "finished") {
      return { kind: "end", payload: { standings: this.standings(), history: this.history } };
    }
    return { kind: "none" };
  }

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

  private get roundDurationMs(): number {
    return this.timings.roundDurationMsOverride ?? this.settings.roundDurationMs;
  }

  private schedule(action: () => void, delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(action, delayMs);
  }

  private openRound(index: number): void {
    this.currentRoundIndex = index;
    this.state = "round";
    this.roundStartedAt = Date.now();
    for (const player of this.players) player.answer = null;

    this.listeners.onRoundStart({
      roundIndex: index,
      roundCount: this.targets.length,
      targetId: this.targets[index]!,
      endsAt: this.roundStartedAt + this.roundDurationMs,
      serverNow: this.roundStartedAt,
    });
    this.emitState();
    this.schedule(() => this.closeRound(), this.roundDurationMs + this.timings.answerGraceMs);
  }

  private closeRound(): void {
    if (this.state !== "round") return;
    const targetId = this.targets[this.currentRoundIndex]!;

    const results: RoundResult[] = this.players.map((player) => {
      const answer = player.answer;
      const points = scoreForAnswer(targetId, answer?.pokemonId ?? null, this.pool.span);
      player.score += points;
      player.totalResponseTimeMs += answer?.responseTimeMs ?? this.roundDurationMs;
      return {
        playerId: player.id,
        nickname: player.nickname,
        pokemonId: answer?.pokemonId ?? null,
        gap: answer ? gapBetween(targetId, answer.pokemonId) : null,
        points,
        responseTimeMs: answer?.responseTimeMs ?? null,
      };
    });

    this.history.push(results);
    this.state = "reveal";
    const now = Date.now();
    this.revealStartedAt = now;
    this.listeners.onReveal({
      roundIndex: this.currentRoundIndex,
      targetId,
      results: [...results].sort((a, b) => b.points - a.points),
      standings: this.standings(),
      revealEndsAt: now + this.timings.revealMs,
      serverNow: now,
    });
    this.emitState();

    const next = this.currentRoundIndex + 1;
    this.schedule(
      () => (next < this.targets.length ? this.openRound(next) : this.endGame()),
      this.timings.revealMs,
    );
  }

  private endGame(): void {
    this.state = "finished";
    this.listeners.onEnd({ standings: this.standings(), history: this.history });
    this.emitState();
  }

  private resetToLobby(): void {
    this.dispose();
    this.state = "lobby";
    this.currentRoundIndex = -1;
    this.targets = [];
    this.history = [];
    for (const player of this.players) {
      player.score = 0;
      player.totalResponseTimeMs = 0;
      player.answer = null;
    }
    this.emitState();
  }

  private standings(): Standing[] {
    const sorted = [...this.players].sort(
      (a, b) =>
        b.score - a.score ||
        a.totalResponseTimeMs - b.totalResponseTimeMs ||
        a.nickname.localeCompare(b.nickname, "fr"),
    );
    let rank = 0;
    let previous: { score: number; time: number } | null = null;
    return sorted.map((player, index) => {
      const tied =
        previous !== null &&
        previous.score === player.score &&
        previous.time === player.totalResponseTimeMs;
      if (!tied) rank = index + 1;
      previous = { score: player.score, time: player.totalResponseTimeMs };
      return {
        rank,
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        totalResponseTimeMs: player.totalResponseTimeMs,
      };
    });
  }
}
