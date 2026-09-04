export const MAX_POKEMON_ID = 1025;

export type GenerationId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const ALL_GENERATIONS: readonly GenerationId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const GENERATION_BOUNDS: Readonly<Record<GenerationId, readonly [number, number]>> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};

export function isGenerationId(value: unknown): value is GenerationId {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}

export function generationOf(id: number): GenerationId {
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
    throw new RangeError(`Numéro de Pokémon hors bornes : ${id}`);
  }
  for (const gen of ALL_GENERATIONS) {
    const [first, last] = GENERATION_BOUNDS[gen];
    if (id >= first && id <= last) return gen;
  }
  throw new RangeError(`Numéro de Pokémon hors bornes : ${id}`);
}

export function idsOfGeneration(gen: GenerationId): number[] {
  const [first, last] = GENERATION_BOUNDS[gen];
  const ids: number[] = [];
  for (let id = first; id <= last; id++) ids.push(id);
  return ids;
}
