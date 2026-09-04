import { describe, expect, it } from "vitest";
import {
  ALL_GENERATIONS,
  GENERATION_BOUNDS,
  MAX_POKEMON_ID,
  generationOf,
  idsOfGeneration,
} from "./generations.js";

describe("generations", () => {
  it("couvre 1 à 1025 sans trou ni chevauchement", () => {
    let expected = 1;
    for (const gen of ALL_GENERATIONS) {
      const [first, last] = GENERATION_BOUNDS[gen];
      expect(first).toBe(expected);
      expect(last).toBeGreaterThanOrEqual(first);
      expected = last + 1;
    }
    expect(expected - 1).toBe(MAX_POKEMON_ID);
  });

  it("respecte les tailles normatives de la spécification", () => {
    const sizes = ALL_GENERATIONS.map((gen) => {
      const [first, last] = GENERATION_BOUNDS[gen];
      return last - first + 1;
    });
    expect(sizes).toEqual([151, 100, 135, 107, 156, 72, 88, 96, 120]);
  });

  it("trouve la génération d'un numéro", () => {
    expect(generationOf(1)).toBe(1);
    expect(generationOf(151)).toBe(1);
    expect(generationOf(152)).toBe(2);
    expect(generationOf(906)).toBe(9);
    expect(generationOf(1025)).toBe(9);
  });

  it("rejette un numéro hors bornes", () => {
    expect(() => generationOf(0)).toThrow(RangeError);
    expect(() => generationOf(1026)).toThrow(RangeError);
    expect(() => generationOf(1.5)).toThrow(RangeError);
  });

  it("liste les numéros d'une génération", () => {
    const gen1 = idsOfGeneration(1);
    expect(gen1).toHaveLength(151);
    expect(gen1[0]).toBe(1);
    expect(gen1.at(-1)).toBe(151);
    expect(idsOfGeneration(6)).toHaveLength(72);
  });
});
