import { type GenerationId, isGenerationId } from "./generations.js";

/**
 * Sentinelle « sans limite de temps ». Zéro et non `Infinity` : les réglages transitent
 * en JSON par le WebSocket, et `JSON.stringify(Infinity)` produit `null`, ce qui ferait
 * échouer la validation à l'arrivée sans rien dire d'utile.
 */
export const UNLIMITED_ROUND_MS = 0;

export const ROUND_DURATIONS = [10000, 15000, 25000, 60000, UNLIMITED_ROUND_MS] as const;

export function isUnlimitedRound(roundDurationMs: number): boolean {
  return roundDurationMs === UNLIMITED_ROUND_MS;
}
export const ROUND_COUNTS = [5, 10, 15] as const;

export type RoundDurationMs = (typeof ROUND_DURATIONS)[number];
export type RoundCount = (typeof ROUND_COUNTS)[number];

/**
 * Le jeu auquel une room joue. Deux jeux réellement différents, pas deux variantes d'un
 * même : « classic » fait deviner un numéro par manche, « blitz » fait nommer le plus de
 * Pokémon possible d'une traite. D'où deux moteurs côté serveur et deux jeux de réglages
 * (`GameSettings` ici, `BlitzSettings` dans `blitz.ts`) plutôt qu'un champ de plus.
 */
export const GAME_MODES = ["classic", "blitz"] as const;

export type GameMode = (typeof GAME_MODES)[number];

export const DEFAULT_GAME_MODE: GameMode = "classic";

/** Le mode envoyé par un client, ou une erreur : le client n'est jamais cru sur parole. */
export function validateGameMode(input: unknown): GameMode {
  if (!GAME_MODES.includes(input as GameMode)) {
    throw new InvalidSettingsError("Mode de jeu invalide.");
  }
  return input as GameMode;
}

export type GameSettings = {
  generations: GenerationId[];
  roundDurationMs: RoundDurationMs;
  roundCount: RoundCount;
};

export const DEFAULT_SETTINGS: GameSettings = {
  generations: [1],
  roundDurationMs: 15000,
  roundCount: 10,
};

export class InvalidSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSettingsError";
  }
}

export function validateSettings(input: unknown): GameSettings {
  if (typeof input !== "object" || input === null) {
    throw new InvalidSettingsError("Réglages invalides.");
  }
  const candidate = input as Partial<Record<keyof GameSettings, unknown>>;

  if (!Array.isArray(candidate.generations)) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  const generations = [...new Set(candidate.generations)].sort((a, b) => Number(a) - Number(b));
  if (generations.length === 0) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  for (const gen of generations) {
    if (!isGenerationId(gen))
      throw new InvalidSettingsError(`Génération invalide : ${String(gen)}`);
  }

  const duration = candidate.roundDurationMs;
  if (!ROUND_DURATIONS.includes(duration as RoundDurationMs)) {
    throw new InvalidSettingsError("Durée de manche invalide.");
  }

  const count = candidate.roundCount;
  if (!ROUND_COUNTS.includes(count as RoundCount)) {
    throw new InvalidSettingsError("Nombre de manches invalide.");
  }

  return {
    generations: generations as GenerationId[],
    roundDurationMs: duration as RoundDurationMs,
    roundCount: count as RoundCount,
  };
}
