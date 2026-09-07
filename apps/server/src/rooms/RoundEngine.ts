import {
  buildPool,
  DEFAULT_SETTINGS,
  type GameSettings,
  gapBetween,
  pickTargets,
  type Pool,
  rngFromSeed,
  type RoomStatus,
  type RoundResult,
  scoreForAnswer,
  type Standing,
} from "@pkfind/shared";
import { RoomError } from "./errors.js";

/**
 * Ce que la mécanique de manche a besoin de savoir d'un joueur : son identité et sa
 * présence, rien de plus. Le jeton, la date d'arrivée et le statut d'hôte restent
 * l'affaire de `Room` — ils ne servent jamais à ouvrir, noter ni classer une manche.
 */
export type RoundPlayer = {
  readonly id: string;
  readonly nickname: string;
  readonly connected: boolean;
};

/**
 * Le seul canal par lequel le moteur remonte vers la room : il lit la liste des joueurs
 * (dans l'ordre d'arrivée, celui des résultats de manche) et redemande une diffusion de
 * `room:state` après chaque transition de phase, car seule `Room` sait construire cet
 * état complet (code, réglages, hôte).
 */
export type RoundHost = {
  roster: () => readonly RoundPlayer[];
  /**
   * Les réglages courants de la room. Lus à la volée plutôt que recopiés au coup d'envoi :
   * `roundDurationMs` doit refléter exactement ce que `Room` détient, comme avant
   * l'extraction. Les générations et le nombre de manches, eux, sont figés dans `pool` et
   * `targets` au démarrage — changer les réglages en pleine partie ne les a jamais bougés.
   */
  settings: () => GameSettings;
  emitState: () => void;
};

export type RoundTimings = {
  countdownMs: number;
  revealMs: number;
  answerGraceMs: number;
  allAnsweredDelayMs: number;
  /** Réservé aux tests : court-circuite la durée de manche des réglages. */
  roundDurationMsOverride?: number;
};

/** Les événements de partie, tous émis par le moteur. `room:state` reste à `Room`. */
export type RoundListeners = {
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

/** La part de l'état d'un joueur qui appartient à la partie, telle que `room:state` la montre. */
export type PlayerProgress = { score: number; hasAnswered: boolean };

/** L'état de jeu d'un joueur, détenu ici et nulle part ailleurs, indexé par identifiant. */
type Scoring = {
  score: number;
  totalResponseTimeMs: number;
  answer: { pokemonId: number; responseTimeMs: number } | null;
};

function blankScoring(): Scoring {
  return { score: 0, totalResponseTimeMs: 0, answer: null };
}

/**
 * La boucle de jeu autoritaire d'une room : décompte, tirage de la série, ouverture et
 * fermeture des manches, notation, classement, fin de partie. Elle possède le timer
 * unique qui enchaîne les phases, la série de cibles, l'historique et le score de chaque
 * joueur ; `Room` ne détient rien de tout cela et n'y touche que par les méthodes
 * publiques ci-dessous.
 *
 * Le moteur ne connaît des joueurs que ce que `RoundHost.roster()` lui montre — identité
 * et présence — et ne modifie jamais leur enregistrement côté `Room` : les scores vivent
 * dans sa propre table, ce qui rend l'appartenance et la partie séparables pour de bon.
 */
export class RoundEngine {
  private phaseValue: RoomStatus = "lobby";
  private pool: Pool = buildPool(DEFAULT_SETTINGS.generations);
  private targets: number[] = [];
  private history: RoundResult[][] = [];
  private readonly scoring = new Map<string, Scoring>();
  private currentRoundIndex = -1;
  private roundStartedAt = 0;
  private revealStartedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  /** Graine de la dernière partie effectivement démarrée ; `null` tant qu'aucune ne l'a été. */
  private lastGameSeed: string | null = null;
  /** Mode retenu par `room:playAgain` pour la prochaine partie. Voir `RoomState.replayMode`. */
  private replayModeValue: "new" | "same" | null = null;

  constructor(
    private readonly timings: RoundTimings,
    private readonly listeners: RoundListeners,
    private readonly host: RoundHost,
    private readonly newGameSeed: () => string,
  ) {}

  get phase(): RoomStatus {
    return this.phaseValue;
  }

  get roundIndex(): number {
    return this.currentRoundIndex;
  }

  get replayMode(): "new" | "same" | null {
    return this.replayModeValue;
  }

  /** Ce que `room:state` doit montrer d'un joueur côté partie. */
  progressOf(playerId: string): PlayerProgress {
    const scoring = this.scoring.get(playerId);
    return { score: scoring?.score ?? 0, hasAnswered: (scoring?.answer ?? null) !== null };
  }

  /** Retenu par `room:playAgain`, consommé au prochain `start()`. */
  chooseReplayMode(sameSeries: boolean): void {
    this.replayModeValue = sameSeries ? "same" : "new";
  }

  /**
   * Changer les réglages (générations, notamment) change le pool sur lequel `pickTargets`
   * tire : rejouer la graine précédente ne reproduirait plus la même série. On retombe
   * donc sur une série neuve plutôt que de tenir une promesse qu'on ne peut plus honorer.
   */
  forgetSameSeries(): void {
    if (this.replayModeValue === "same") this.replayModeValue = "new";
  }

  /** Lance le décompte puis la première manche. `Room` a déjà validé hôte, phase et quorum. */
  start(): void {
    const settings = this.host.settings();
    this.pool = buildPool(settings.generations);
    // Rejoue la graine de la partie précédente si l'hôte a choisi "même série" ; en tire une
    // nouvelle sinon (comportement historique). `lastGameSeed` ne peut être `null` ici que si
    // `replayMode` vaut "same" par un chemin qui contournerait `playAgain` : on retombe alors
    // sur une graine neuve plutôt que de planter.
    const seed =
      this.replayModeValue === "same" && this.lastGameSeed !== null
        ? this.lastGameSeed
        : this.newGameSeed();
    this.lastGameSeed = seed;
    this.targets = pickTargets(this.pool.ids, settings.roundCount, rngFromSeed(seed));
    this.history = [];
    this.currentRoundIndex = -1;
    this.scoring.clear();

    this.phaseValue = "countdown";
    const now = Date.now();
    this.listeners.onCountdown({ startsAt: now + this.timings.countdownMs, serverNow: now });
    this.host.emitState();
    this.schedule(() => this.openRound(0), this.timings.countdownMs);
  }

  /**
   * Enregistre la réponse d'un joueur dont `Room` a déjà vérifié qu'il est bien de la
   * room (`NOT_IN_ROOM` prime sur `ROUND_CLOSED`, comme avant l'extraction).
   */
  answer(playerId: string, roundIndex: number, pokemonId: number): void {
    if (this.phaseValue !== "round" || roundIndex !== this.currentRoundIndex) {
      throw new RoomError("ROUND_CLOSED");
    }
    const scoring = this.trackScoring(playerId);
    if (scoring.answer !== null) throw new RoomError("ALREADY_ANSWERED");
    if (!this.pool.ids.includes(pokemonId)) throw new RoomError("NOT_IN_POOL");

    const elapsed = Date.now() - this.roundStartedAt;
    if (elapsed > this.roundDurationMs + this.timings.answerGraceMs) {
      throw new RoomError("ROUND_CLOSED");
    }

    scoring.answer = { pokemonId, responseTimeMs: Math.min(elapsed, this.roundDurationMs) };
    this.listeners.onAnswered({ playerId });
    this.host.emitState();

    const connected = this.host.roster().filter((player) => player.connected);
    if (
      connected.length > 0 &&
      connected.every((player) => (this.scoring.get(player.id)?.answer ?? null) !== null)
    ) {
      this.schedule(() => this.closeRound(), this.timings.allAnsweredDelayMs);
    }
  }

  /**
   * Ce qu'un socket qui vient de se reconnecter (`room:rejoin`) doit recevoir en plus de
   * `room:state` pour retrouver l'écran de jeu courant. Ne transporte jamais le Pokémon
   * cible tant que la manche est en cours : seul le numéro (`targetId`) sort d'ici,
   * exactement comme `round:start` — la résolution du Pokémon reste le travail de
   * l'appelant, au moment de la révélation.
   */
  snapshot(): RejoinSnapshot {
    const now = Date.now();
    if (this.phaseValue === "round") {
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
    if (this.phaseValue === "reveal") {
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
    if (this.phaseValue === "finished") {
      return { kind: "end", payload: { standings: this.standings(), history: this.history } };
    }
    return { kind: "none" };
  }

  /** Coupe la partie net et ramène le moteur au repos : scores, série et historique effacés. */
  reset(): void {
    this.dispose();
    this.phaseValue = "lobby";
    this.currentRoundIndex = -1;
    this.targets = [];
    this.history = [];
    this.scoring.clear();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private get roundDurationMs(): number {
    return this.timings.roundDurationMsOverride ?? this.host.settings().roundDurationMs;
  }

  private schedule(action: () => void, delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(action, delayMs);
  }

  /** L'état de jeu d'un joueur, créé à la volée : on ne le tient que pour qui joue. */
  private trackScoring(playerId: string): Scoring {
    const existing = this.scoring.get(playerId);
    if (existing) return existing;
    const fresh = blankScoring();
    this.scoring.set(playerId, fresh);
    return fresh;
  }

  private openRound(index: number): void {
    this.currentRoundIndex = index;
    this.phaseValue = "round";
    this.roundStartedAt = Date.now();
    for (const scoring of this.scoring.values()) scoring.answer = null;

    this.listeners.onRoundStart({
      roundIndex: index,
      roundCount: this.targets.length,
      targetId: this.targets[index]!,
      endsAt: this.roundStartedAt + this.roundDurationMs,
      serverNow: this.roundStartedAt,
    });
    this.host.emitState();
    // La fermeture automatique attend la tolérance de latence en plus de la durée nominale,
    // sans quoi la fenêtre de grâce de `answer()` serait du code mort.
    this.schedule(() => this.closeRound(), this.roundDurationMs + this.timings.answerGraceMs);
  }

  private closeRound(): void {
    if (this.phaseValue !== "round") return;
    const targetId = this.targets[this.currentRoundIndex]!;

    const results: RoundResult[] = this.host.roster().map((player) => {
      const scoring = this.trackScoring(player.id);
      const answer = scoring.answer;
      const points = scoreForAnswer(targetId, answer?.pokemonId ?? null, this.pool.span);
      scoring.score += points;
      scoring.totalResponseTimeMs += answer?.responseTimeMs ?? this.roundDurationMs;
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
    this.phaseValue = "reveal";
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
    this.host.emitState();

    const next = this.currentRoundIndex + 1;
    this.schedule(
      () => (next < this.targets.length ? this.openRound(next) : this.endGame()),
      this.timings.revealMs,
    );
  }

  private endGame(): void {
    this.phaseValue = "finished";
    this.listeners.onEnd({ standings: this.standings(), history: this.history });
    this.host.emitState();
  }

  private standings(): Standing[] {
    const sorted = this.host
      .roster()
      .map((player) => {
        const scoring = this.scoring.get(player.id);
        return {
          playerId: player.id,
          nickname: player.nickname,
          score: scoring?.score ?? 0,
          totalResponseTimeMs: scoring?.totalResponseTimeMs ?? 0,
        };
      })
      .sort(
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
        playerId: player.playerId,
        nickname: player.nickname,
        score: player.score,
        totalResponseTimeMs: player.totalResponseTimeMs,
      };
    });
  }
}
