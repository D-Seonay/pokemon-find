import { describe, expect, it } from "vitest";
import { InvalidPoolError, buildPool, poolSignature } from "./pool.js";

describe("buildPool", () => {
  it("construit le pool de la génération 1", () => {
    const pool = buildPool([1]);
    expect(pool.ids).toHaveLength(151);
    expect(pool.minId).toBe(1);
    expect(pool.maxId).toBe(151);
    expect(pool.span).toBe(151);
  });

  it("construit le pool national", () => {
    const pool = buildPool([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pool.ids).toHaveLength(1025);
    expect(pool.span).toBe(1025);
  });

  it("calcule le span sur l'étendue et non sur le nombre pour un pool discontinu", () => {
    const pool = buildPool([1, 3]);
    expect(pool.ids).toHaveLength(286);
    expect(pool.minId).toBe(1);
    expect(pool.maxId).toBe(386);
    expect(pool.span).toBe(386);
  });

  it("normalise l'entrée : tri, déduplication", () => {
    const pool = buildPool([3, 1, 1]);
    expect(pool.generations).toEqual([1, 3]);
  });

  it("rejette une liste vide", () => {
    expect(() => buildPool([])).toThrow(InvalidPoolError);
  });

  it("rejette une génération hors bornes", () => {
    expect(() => buildPool([0])).toThrow(InvalidPoolError);
    expect(() => buildPool([10])).toThrow(InvalidPoolError);
    expect(() => buildPool([2.5])).toThrow(InvalidPoolError);
  });

  it("renvoie des ids triés croissant", () => {
    const { ids } = buildPool([5, 2]);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]!).toBeGreaterThan(ids[i - 1]!);
    }
  });
});

describe("poolSignature", () => {
  it("produit une signature stable", () => {
    expect(poolSignature([1])).toBe("1");
    expect(poolSignature([1, 3, 5])).toBe("1-3-5");
  });
});
