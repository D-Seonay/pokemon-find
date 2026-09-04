import { type GenerationId, isGenerationId } from "./generations.js";

export const ROUND_DURATIONS = [10000, 15000, 25000] as const;
export const ROUND_COUNTS = [5, 10, 15] as const;

export type RoundDurationMs = (typeof ROUND_DURATIONS)[number];
export type RoundCount = (typeof ROUND_COUNTS)[number];

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
