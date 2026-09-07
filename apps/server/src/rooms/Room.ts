import { randomBytes, randomUUID } from "node:crypto";
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  type PlayerPublic,
  type RoomState,
  type RoomStatus,
  validateSettings,
} from "@pkfind/shared";
import { RoomError } from "./errors.js";
import {
  type RejoinSnapshot,
  RoundEngine,
  type RoundListeners,
  type RoundTimings,
} from "./RoundEngine.js";

export { RoomError };
export type { RejoinSnapshot };

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;

const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{2,16}$/u;

export type RoomTimings = RoundTimings;

/** Les événements de partie (`RoundListeners`, émis par le moteur) plus `room:state`. */
export type RoomListeners = RoundListeners & {
  onState: (state: RoomState) => void;
};

/**
 * L'appartenance à la room : identité, jeton de reconnexion, présence, ancienneté. Aucun
 * score, aucune réponse — c'est `RoundEngine` qui les tient, indexés par `id`.
 * Structurellement un `RoundPlayer`, ce que le `roster` passé au moteur vérifie.
 */
type Player = {
  id: string;
  token: string;
  nickname: string;
  connected: boolean;
  joinedAt: number;
};

/**
 * L'appartenance à une room : qui est là, sous quel pseudo, qui est hôte, avec quels
 * réglages. Tout ce qui relève de la partie elle-même — décompte, cibles, timers, scores,
 * classement — appartient à `RoundEngine`, que `Room` possède et à qui elle délègue ;
 * `Room` reste la façade que la couche socket connaît.
 */
export class Room {
  readonly createdAt = Date.now();
  private players: Player[] = [];
  private hostId: string | null = null;
  private settings: GameSettings = DEFAULT_SETTINGS;
  private readonly rounds: RoundEngine;

  constructor(
    readonly code: string,
    timings: RoomTimings,
    private readonly listeners: RoomListeners,
    newGameSeed: () => string = () => `room:${code}:${randomUUID()}`,
  ) {
    this.rounds = new RoundEngine(
      timings,
      listeners,
      {
        roster: () => this.players,
        settings: () => this.settings,
        emitState: () => this.emitState(),
      },
      newGameSeed,
    );
  }

  get status(): RoomStatus {
    return this.rounds.phase;
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
    if (this.rounds.phase !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.players.length >= MAX_PLAYERS) throw new RoomError("ROOM_FULL");

    const nickname = this.uniqueNickname(rawNickname.trim());
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(16).toString("hex"),
      nickname,
      connected: true,
      joinedAt: Date.now(),
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
    if (this.connectedCount === 0 && this.rounds.phase !== "lobby") {
      this.resetToLobby();
      return;
    }
    this.emitState();
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((player) => player.id !== playerId);
    if (this.hostId === playerId) this.hostId = null;
    this.reassignHostIfNeeded();
    if (this.connectedCount === 0 && this.rounds.phase !== "lobby") {
      this.resetToLobby();
      return;
    }
    this.emitState();
  }

  updateSettings(playerId: string, settings: unknown): void {
    this.assertHost(playerId);
    if (this.rounds.phase !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    try {
      this.settings = validateSettings(settings);
    } catch {
      throw new RoomError("INVALID_SETTINGS");
    }
    // Les nouveaux réglages ne permettent plus de garantir la même série : le moteur
    // retombe sur une série neuve.
    this.rounds.forgetSameSeries();
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
    if (this.rounds.phase !== "lobby") throw new RoomError("GAME_IN_PROGRESS");
    if (this.connectedCount < MIN_PLAYERS_TO_START) throw new RoomError("NOT_ENOUGH_PLAYERS");
    this.rounds.start();
  }

  answer(playerId: string, roundIndex: number, pokemonId: number): void {
    // `NOT_IN_ROOM` prime sur toute erreur de manche : on vérifie l'appartenance ici, où
    // elle est connue, avant de laisser le moteur juger de la manche.
    this.find(playerId);
    this.rounds.answer(playerId, roundIndex, pokemonId);
  }

  /**
   * `sameSeries` : rejoue la série de cibles de la partie qui vient de se terminer (même
   * graine, donc mêmes numéros dans le même ordre) plutôt que d'en tirer une nouvelle.
   * Toujours possible ici : atteindre l'état `finished` exige d'avoir déjà démarré une
   * partie, donc d'avoir déjà une graine à rejouer.
   */
  playAgain(playerId: string, sameSeries = false): void {
    this.assertHost(playerId);
    if (this.rounds.phase !== "finished") throw new RoomError("GAME_IN_PROGRESS");
    this.rounds.chooseReplayMode(sameSeries);
    this.resetToLobby();
  }

  dispose(): void {
    this.rounds.dispose();
  }

  toState(): RoomState {
    return {
      code: this.code,
      status: this.rounds.phase,
      settings: this.settings,
      players: this.players.map((player): PlayerPublic => {
        const progress = this.rounds.progressOf(player.id);
        return {
          id: player.id,
          nickname: player.nickname,
          connected: player.connected,
          isHost: player.id === this.hostId,
          score: progress.score,
          hasAnswered: progress.hasAnswered,
        };
      }),
      roundIndex: this.rounds.roundIndex,
      roundCount: this.settings.roundCount,
      replayMode: this.rounds.replayMode,
    };
  }

  /**
   * Ce qu'un socket qui vient de se reconnecter (`room:rejoin`) doit recevoir en plus de
   * `room:state` pour retrouver l'écran de jeu courant. Voir `RoundEngine.snapshot()` :
   * le Pokémon cible n'en sort jamais, seul son numéro.
   */
  snapshotForRejoin(): RejoinSnapshot {
    return this.rounds.snapshot();
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

  /** Coupe la partie en cours et rediffuse le lobby. */
  private resetToLobby(): void {
    this.rounds.reset();
    this.emitState();
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
