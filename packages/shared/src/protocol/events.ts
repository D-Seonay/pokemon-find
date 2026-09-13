import type { Pokemon } from "../data/pokemon.js";
import type { BlitzSettings } from "../domain/blitz.js";
import type { GameMode, GameSettings } from "../domain/settings.js";

/**
 * `"blitz"` est à « contre la montre » ce que `"round"` est au mode classique : la phase
 * pendant laquelle on joue. Un seul moteur est actif à la fois (voir `RoomState.gameMode`),
 * donc ces phases ne se croisent jamais.
 */
export type RoomStatus = "lobby" | "countdown" | "round" | "reveal" | "blitz" | "finished";

export type PlayerPublic = {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  /**
   * Le score du mode en cours : les points cumulés en classique, le nombre de Pokémon
   * trouvés en blitz. Un nombre, jamais la liste de ce qui a été trouvé — la diffuser
   * donnerait les réponses à tous les autres joueurs.
   */
  score: number;
  /** Toujours `false` en blitz : chacun joue sa propre liste, il n'y a rien à attendre. */
  hasAnswered: boolean;
};

export type RoomState = {
  code: string;
  status: RoomStatus;
  /** Le jeu auquel cette room joue. Choisi par l'hôte en lobby, figé pendant la partie. */
  gameMode: GameMode;
  settings: GameSettings;
  /** Réglages du mode blitz. Présents quel que soit `gameMode` : l'hôte les prépare en lobby. */
  blitzSettings: BlitzSettings;
  players: PlayerPublic[];
  roundIndex: number;
  roundCount: number;
  /**
   * Mode retenu pour la prochaine partie (ou la partie en cours) : `null` tant que la room
   * n'a jamais joué — il n'y a alors rien à rejouer, la question ne se pose pas encore.
   * `"same"` réutilise la graine de la dernière partie jouée (mêmes cibles, même ordre) ;
   * `"new"` en tire une nouvelle. Fixé par `room:playAgain`, visible de tous en lobby avant
   * que l'hôte ne relance.
   */
  replayMode: "new" | "same" | null;
};

export type RoundResult = {
  playerId: string;
  nickname: string;
  pokemonId: number | null;
  gap: number | null;
  points: number;
  responseTimeMs: number | null;
};

export type Standing = {
  rank: number;
  playerId: string;
  nickname: string;
  score: number;
  totalResponseTimeMs: number;
};

export const ERROR_CODES = [
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "GAME_IN_PROGRESS",
  "NOT_HOST",
  "NOT_IN_ROOM",
  "NOT_ENOUGH_PLAYERS",
  "INVALID_NICKNAME",
  "INVALID_SETTINGS",
  "INVALID_CODE",
  "ALREADY_ANSWERED",
  "ROUND_CLOSED",
  "BLITZ_CLOSED",
  "NOT_IN_POOL",
  "INVALID_TOKEN",
  "RATE_LIMITED",
  "SERVER_BUSY",
  "CODE_EXHAUSTED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: "Cette room n'existe pas ou plus.",
  ROOM_FULL: "Cette room est complète (8 joueurs maximum).",
  GAME_IN_PROGRESS: "La partie a déjà commencé, impossible de rejoindre.",
  NOT_HOST: "Seul l'hôte peut faire ça.",
  NOT_IN_ROOM: "Tu n'es pas dans cette room.",
  NOT_ENOUGH_PLAYERS: "Il faut au moins 2 joueurs connectés pour démarrer.",
  INVALID_NICKNAME: "Pseudo invalide : 2 à 16 caractères, lettres et chiffres.",
  INVALID_SETTINGS:
    "Réglages de partie invalides : vérifie les générations et la durée des manches choisies.",
  INVALID_CODE: "Ce code contient un caractère invalide.",
  ALREADY_ANSWERED: "Tu as déjà répondu à cette manche.",
  ROUND_CLOSED: "Trop tard, la manche est terminée.",
  BLITZ_CLOSED: "Trop tard, la partie est terminée.",
  NOT_IN_POOL: "Ce Pokémon ne fait pas partie de la sélection.",
  INVALID_TOKEN: "Session invalide, reconnecte-toi.",
  RATE_LIMITED: "Trop de requêtes, ralentis un peu.",
  SERVER_BUSY: "Le serveur est saturé, réessaie dans un instant.",
  CODE_EXHAUSTED: "Impossible de générer un code, réessaie.",
  INTERNAL: "Une erreur est survenue, réessaie dans un instant.",
};

export type Ack<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

export type JoinPayload = {
  roomCode: string;
  playerId: string;
  playerToken: string;
  nickname: string;
  state: RoomState;
};

export type ClientToServerEvents = {
  "room:create": (
    input: { nickname: string; settings: GameSettings },
    ack: (result: Ack<JoinPayload>) => void,
  ) => void;
  "room:join": (
    input: { roomCode: string; nickname: string },
    ack: (result: Ack<JoinPayload>) => void,
  ) => void;
  "room:rejoin": (
    input: { roomCode: string; playerId: string; playerToken: string },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "room:leave": (input: Record<string, never>, ack: (result: Ack<null>) => void) => void;
  "room:settings": (
    input: { settings: GameSettings },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  /**
   * Choisit le jeu de la prochaine partie et, dans la foulée, les réglages blitz. Un seul
   * événement pour les deux : basculer en blitz sans pouvoir régler la durée dans le même
   * geste obligerait l'hôte à deux allers-retours pour un seul choix.
   */
  "room:mode": (
    input: { mode: GameMode; blitz: BlitzSettings },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "room:start": (input: Record<string, never>, ack: (result: Ack<null>) => void) => void;
  "room:playAgain": (
    /** `sameSeries: true` rejoue la série de cibles de la partie qui vient de se terminer. */
    input: { sameSeries: boolean },
    ack: (result: Ack<{ state: RoomState }>) => void,
  ) => void;
  "round:answer": (
    input: { roundIndex: number; pokemonId: number },
    ack: (result: Ack<{ accepted: true }>) => void,
  ) => void;
  /**
   * Une fournée de noms saisis, pas un nom par événement : à pleine vitesse de frappe un
   * joueur dépasse la limite de débit du socket (20 événements / 10 s) et se fait
   * déconnecter pour avoir bien joué. Voir `BLITZ_FLUSH_MS` côté client.
   *
   * Le serveur rapproche lui-même chaque nom du pool (`matchPokemonName`) : le client
   * n'est pas cru sur ce qu'il a trouvé, seulement sur ce qu'il a tapé.
   */
  "blitz:submit": (
    input: { names: string[] },
    ack: (result: Ack<{ count: number; found: number[] }>) => void,
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (state: RoomState) => void;
  "game:countdown": (payload: { startsAt: number; serverNow: number }) => void;
  "round:start": (payload: {
    roundIndex: number;
    roundCount: number;
    targetId: number;
    endsAt: number;
    serverNow: number;
  }) => void;
  "round:answered": (payload: { playerId: string }) => void;
  /**
   * L'équivalent blitz de `round:start`. `found` est la liste des Pokémon déjà trouvés par
   * LE destinataire : vide au coup d'envoi (diffusé à toute la room), remplie seulement
   * quand l'événement est réémis à un seul socket qui se reconnecte en pleine partie.
   * Rien de ce que les autres ont trouvé n'y figure jamais — ce serait leur donner les
   * réponses. Le classement en direct passe par `room:state`, qui ne porte que des
   * compteurs.
   */
  "blitz:start": (payload: { endsAt: number; serverNow: number; found: number[] }) => void;
  "round:reveal": (payload: {
    roundIndex: number;
    target: Pokemon;
    results: RoundResult[];
    standings: Standing[];
    revealEndsAt: number;
    serverNow: number;
  }) => void;
  "game:end": (payload: { standings: Standing[]; history: RoundResult[][] }) => void;
  "room:closed": (payload: { reason: "expired" | "empty" | "shutdown" }) => void;
};
