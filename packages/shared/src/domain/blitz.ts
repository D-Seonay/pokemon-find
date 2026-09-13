import { type Pokemon, pokemonOfPool } from "../data/pokemon.js";
import { type GenerationId, isGenerationId } from "./generations.js";
import { normalizeName } from "./names.js";
import type { Pool } from "./pool.js";
import { InvalidSettingsError } from "./settings.js";

/**
 * Le mode « blitz » : nommer le plus de Pokémon possible d'un pool dans un temps imparti.
 * Rien à voir avec le mode principal, qui fait deviner un numéro à la fois — d'où des
 * réglages séparés plutôt qu'un champ de plus dans `GameSettings`.
 */
export const BLITZ_DURATIONS = [60_000, 180_000, 300_000, 600_000] as const;

export type BlitzDurationMs = (typeof BLITZ_DURATIONS)[number];

export type BlitzSettings = {
  generations: GenerationId[];
  durationMs: BlitzDurationMs;
};

export const DEFAULT_BLITZ_SETTINGS: BlitzSettings = {
  generations: [1],
  durationMs: 180_000,
};

export function validateBlitzSettings(input: unknown): BlitzSettings {
  if (typeof input !== "object" || input === null) {
    throw new InvalidSettingsError("Réglages invalides.");
  }
  const candidate = input as Partial<Record<keyof BlitzSettings, unknown>>;

  if (!Array.isArray(candidate.generations)) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  const generations = [...new Set(candidate.generations)].sort((a, b) => Number(a) - Number(b));
  if (generations.length === 0) {
    throw new InvalidSettingsError("Sélectionne au moins une génération.");
  }
  for (const gen of generations) {
    if (!isGenerationId(gen)) {
      throw new InvalidSettingsError(`Génération invalide : ${String(gen)}`);
    }
  }

  const duration = candidate.durationMs;
  if (!BLITZ_DURATIONS.includes(duration as BlitzDurationMs)) {
    throw new InvalidSettingsError("Durée de partie invalide.");
  }

  return { generations: generations as GenerationId[], durationMs: duration as BlitzDurationMs };
}

/**
 * Le Pokémon du pool dont un nom — français ou anglais — correspond EXACTEMENT à la
 * saisie, une fois normalisée. Exactement, et non « commence par » : en blitz la
 * validation est automatique dès que la frappe correspond, et un préfixe ferait
 * enregistrer « Rat » à la place de « Rattata » avant même la fin du mot.
 *
 * `undefined` si rien ne correspond : le joueur continue simplement de taper.
 */
export function matchPokemonName(input: string, pool: Pool): Pokemon | undefined {
  const slug = normalizeName(input);
  if (slug.length === 0) return undefined;
  return pokemonOfPool(pool).find((p) => p.slugFr === slug || p.slugEn === slug);
}
