import { type GenerationId, idsOfGeneration, isGenerationId } from "./generations.js";

export class InvalidPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPoolError";
  }
}

export type Pool = {
  generations: GenerationId[];
  ids: number[];
  minId: number;
  maxId: number;
  span: number;
};

export function buildPool(generations: readonly number[]): Pool {
  const unique = [...new Set(generations)].sort((a, b) => a - b);
  if (unique.length === 0) {
    throw new InvalidPoolError("Sélectionne au moins une génération.");
  }
  for (const gen of unique) {
    if (!isGenerationId(gen)) {
      throw new InvalidPoolError(`Génération invalide : ${gen}`);
    }
  }
  const typed = unique as GenerationId[];
  const ids = typed.flatMap(idsOfGeneration);
  const minId = ids[0]!;
  const maxId = ids[ids.length - 1]!;
  return { generations: typed, ids, minId, maxId, span: maxId - minId + 1 };
}

export function poolSignature(generations: readonly GenerationId[]): string {
  return [...generations].sort((a, b) => a - b).join("-");
}
