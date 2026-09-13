import {
  type BlitzSettings,
  DEFAULT_BLITZ_SETTINGS,
  buildPool,
  matchPokemonName,
  type Pool,
  type RoomStatus,
  type RoundResult,
  type Standing,
} from "@pkfind/shared";
import { RoomError } from "./errors.js";
import type { PlayerProgress, RoundListeners, RoundPlayer } from "./RoundEngine.js";

/**
 * Bornes de garde sur une fournée de noms. Le client honnête regroupe ses trouvailles
 * toutes les deux secondes (voir `BLITZ_FLUSH_MS`) : même en tapant très vite, cela fait
 * une poignée de noms par envoi, très loin de cette borne. Au-delà, c'est un client
 * modifié, et le serveur ne doit pas accepter de travailler proportionnellement à ce
 * qu'on lui envoie. Les noms excédentaires sont ignorés, pas refusés : une erreur
 * apprendrait au tricheur où est la limite, sans rien apporter à personne d'honnête.
 */
export const MAX_NAMES_PER_SUBMIT = 32;
/** Le plus long nom du jeu tient très en dessous ; au-delà c'est du remplissage. */
export const MAX_NAME_LENGTH = 40;

/**
 * Le seul canal par lequel le moteur blitz remonte vers la room, calqué sur `RoundHost` :
 * la liste des joueurs, les réglages lus à la volée, et la redemande de diffusion de
 * `room:state` — seule `Room` sait construire cet état complet.
 */
export type BlitzHost = {
  roster: () => readonly RoundPlayer[];
  settings: () => BlitzSettings;
  emitState: () => void;
};

export type BlitzTimings = {
  countdownMs: number;
  /** Tolérance de latence après l'échéance, comme en mode classique. */
  answerGraceMs: number;
  /** Réservé aux tests : court-circuite la durée des réglages (la plus courte est d'une minute). */
  durationMsOverride?: number;
};

/**
 * Le seul événement que le blitz ajoute. Le décompte (`onCountdown`) et la fin de partie
 * (`onEnd`) sont exactement ceux du mode classique — même charge utile, même sens — et
 * sont donc réutilisés tels quels plutôt que dupliqués sous un autre nom.
 */
export type BlitzOnlyListeners = {
  onBlitzStart: (payload: { endsAt: number; serverNow: number; found: number[] }) => void;
};

export type BlitzListeners = Pick<RoundListeners, "onCountdown" | "onEnd"> &
  Partial<BlitzOnlyListeners>;

/**
 * Ce qu'un socket qui se reconnecte en pleine partie blitz doit recevoir : l'échéance, et
 * SA liste à lui. Émis à ce seul socket, jamais diffusé.
 */
export type BlitzSnapshot = {
  kind: "blitz";
  payload: { endsAt: number; serverNow: number; found: number[] };
};

/** L'état blitz d'un joueur. `lastFoundAt` sert au départage : qui a atteint son total en premier. */
type Progress = { found: Set<number>; lastFoundAt: number };

/** Une partie blitz n'a pas de manches : il n'y a donc aucun historique à rendre. */
const NO_HISTORY: RoundResult[][] = [];

/**
 * La boucle de jeu autoritaire d'une room en mode « contre la montre » : décompte, une
 * seule session chronométrée, une liste de trouvailles par joueur, classement final.
 *
 * Rien de commun avec `RoundEngine` au-delà de la forme — pas de manches, pas de cibles,
 * pas d'attente mutuelle : chaque joueur court sur sa propre liste et personne n'est
 * jamais bloqué par personne. Les deux moteurs sont donc deux classes séparées derrière
 * la même poignée (`GameEngine` dans `Room.ts`), et non un moteur paramétré.
 */
export class BlitzEngine {
  private phaseValue: RoomStatus = "lobby";
  private pool: Pool = buildPool(DEFAULT_BLITZ_SETTINGS.generations);
  private readonly progress = new Map<string, Progress>();
  private startedAt = 0;
  private endsAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly timings: BlitzTimings,
    private readonly listeners: BlitzListeners,
    private readonly host: BlitzHost,
  ) {}

  get phase(): RoomStatus {
    return this.phaseValue;
  }

  /** Ce que `room:state` doit montrer d'un joueur : combien il a trouvé, jamais quoi. */
  progressOf(playerId: string): PlayerProgress {
    return {
      score: this.progress.get(playerId)?.found.size ?? 0,
      // Le blitz n'a rien à attendre de personne : chacun remplit sa propre liste.
      hasAnswered: false,
    };
  }

  /** Lance le décompte puis la session. `Room` a déjà validé hôte, phase et quorum. */
  start(): void {
    this.pool = buildPool(this.host.settings().generations);
    this.progress.clear();

    this.phaseValue = "countdown";
    const now = Date.now();
    this.listeners.onCountdown({ startsAt: now + this.timings.countdownMs, serverNow: now });
    this.host.emitState();
    this.schedule(() => this.open(), this.timings.countdownMs);
  }

  /**
   * Enregistre une fournée de noms saisis par un joueur dont `Room` a déjà vérifié
   * l'appartenance. Le rapprochement avec le pool se fait ici et nulle part ailleurs : le
   * client dit ce qu'il a tapé, jamais ce qu'il a trouvé.
   *
   * Rend le total du joueur et les identifiants nouvellement acquis — à SON socket
   * uniquement, par l'accusé de réception. Rien de tout cela n'est diffusé.
   */
  submit(playerId: string, names: unknown): { count: number; found: number[] } {
    if (this.phaseValue !== "blitz") throw new RoomError("BLITZ_CLOSED");
    if (Date.now() > this.endsAt + this.timings.answerGraceMs) {
      throw new RoomError("BLITZ_CLOSED");
    }
    const progress = this.track(playerId);
    const found: number[] = [];
    for (const name of this.sanitize(names)) {
      const match = matchPokemonName(name, this.pool);
      if (!match || progress.found.has(match.id)) continue;
      progress.found.add(match.id);
      progress.lastFoundAt = Date.now();
      found.push(match.id);
    }
    if (found.length > 0) {
      this.host.emitState();
      this.endIfEveryoneIsDone();
    }
    return { count: progress.found.size, found };
  }

  snapshot(playerId: string): BlitzSnapshot {
    return {
      kind: "blitz",
      payload: {
        endsAt: this.endsAt,
        serverNow: Date.now(),
        found: [...this.track(playerId).found],
      },
    };
  }

  /** Le classement, à tout instant : nombre de trouvailles, puis qui a atteint ce total en premier. */
  standings(): Standing[] {
    const sorted = this.host
      .roster()
      .map((player) => {
        const progress = this.progress.get(player.id);
        return {
          playerId: player.id,
          nickname: player.nickname,
          score: progress?.found.size ?? 0,
          // Le temps mis pour arriver à ce total, compté depuis le coup d'envoi. Zéro
          // pour qui n'a rien trouvé : il est déjà dernier par le score, le départage ne
          // le concerne pas.
          totalResponseTimeMs:
            progress && progress.found.size > 0 ? progress.lastFoundAt - this.startedAt : 0,
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
      return { rank, ...player };
    });
  }

  /** Coupe la partie net et ramène le moteur au repos. */
  reset(): void {
    this.dispose();
    this.phaseValue = "lobby";
    this.progress.clear();
    this.startedAt = 0;
    this.endsAt = 0;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private get durationMs(): number {
    return this.timings.durationMsOverride ?? this.host.settings().durationMs;
  }

  /**
   * Ce qu'on accepte d'examiner d'une charge utile venue du réseau : un tableau de chaînes,
   * borné en nombre et en longueur. Tout le reste est ignoré sans bruit.
   */
  private sanitize(names: unknown): string[] {
    if (!Array.isArray(names)) return [];
    return (names as unknown[])
      .slice(0, MAX_NAMES_PER_SUBMIT)
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.slice(0, MAX_NAME_LENGTH));
  }

  private schedule(action: () => void, delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(action, delayMs);
  }

  private track(playerId: string): Progress {
    const existing = this.progress.get(playerId);
    if (existing) return existing;
    const fresh: Progress = { found: new Set<number>(), lastFoundAt: 0 };
    this.progress.set(playerId, fresh);
    return fresh;
  }

  private open(): void {
    this.phaseValue = "blitz";
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.durationMs;
    this.listeners.onBlitzStart?.({
      endsAt: this.endsAt,
      serverNow: this.startedAt,
      // Un coup d'envoi est diffusé à toute la room : personne n'a encore rien trouvé, et
      // c'est bien la seule diffusion où ce champ peut exister sans donner les réponses.
      found: [],
    });
    this.host.emitState();
    // La fermeture attend la tolérance de latence en plus de la durée nominale, sans quoi
    // la fenêtre de grâce de `submit()` serait du code mort : la dernière fournée du
    // client part au moment même où son chronomètre atteint zéro.
    this.schedule(() => this.end(), this.durationMs + this.timings.answerGraceMs);
  }

  /**
   * Tout le pool trouvé par tous les joueurs encore connectés : plus rien à jouer, on
   * n'attend pas le chronomètre. Les déconnectés sont écartés du test — sinon un onglet
   * fermé empêcherait à lui seul la partie de se conclure.
   */
  private endIfEveryoneIsDone(): void {
    const connected = this.host.roster().filter((player) => player.connected);
    if (connected.length === 0) return;
    const complete = connected.every(
      (player) => (this.progress.get(player.id)?.found.size ?? 0) === this.pool.ids.length,
    );
    if (complete) this.end();
  }

  private end(): void {
    if (this.phaseValue !== "blitz") return;
    this.dispose();
    this.phaseValue = "finished";
    this.listeners.onEnd({ standings: this.standings(), history: NO_HISTORY });
    this.host.emitState();
  }
}
