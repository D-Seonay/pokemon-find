import { describe, expect, it } from "vitest";
import { buildPool } from "./pool.js";
import { fnv1a32, mulberry32, pickTargets, randomSeed, rngFromSeed } from "./random.js";

describe("fnv1a32", () => {
  it("est déterministe et non signé", () => {
    const a = fnv1a32("daily:2026-09-04");
    expect(a).toBe(fnv1a32("daily:2026-09-04"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 32);
  });

  it("produit des valeurs différentes pour des entrées proches", () => {
    expect(fnv1a32("daily:2026-09-04")).not.toBe(fnv1a32("daily:2026-09-05"));
  });

  // Golden vector tests against published FNV-1a 32-bit vectors.
  // This implementation hashes UTF-16 code units via charCodeAt, so it coincides with
  // byte-oriented FNV-1a only for ASCII input — which is all our seeds ever are
  // (daily:YYYY-MM-DD, room:CODE:uuid, solo:<hex>).
  it("produit les vecteurs de référence publiés FNV-1a 32", () => {
    expect(fnv1a32("")).toBe(2166136261); // 0x811c9dc5, offset basis
    expect(fnv1a32("a")).toBe(3826002220); // 0xe40c292c
    expect(fnv1a32("abc")).toBe(440920331); // 0x1a47e90b
    expect(fnv1a32("foobar")).toBe(3214735720); // 0xbf9cf968
  });
});

describe("mulberry32", () => {
  it("produit des flottants dans [0, 1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("rejoue la même suite pour la même graine", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  // Frozen regression test: asserts that mulberry32(42) has not silently changed.
  // These values were obtained by running the current correct implementation once;
  // they cannot prove the algorithm is right, only that it has not drifted.
  it("produit les valeurs gelées pour mulberry32(42)", () => {
    const rng = mulberry32(42);
    expect(rng()).toBe(0.6011037519201636);
    expect(rng()).toBe(0.44829055899754167);
    expect(rng()).toBe(0.8524657934904099);
  });
});

describe("pickTargets", () => {
  const pool = buildPool([1]);

  it("est déterministe pour une graine donnée", () => {
    const first = pickTargets(pool.ids, 10, rngFromSeed("daily:2026-09-04"));
    const second = pickTargets(pool.ids, 10, rngFromSeed("daily:2026-09-04"));
    expect(first).toEqual(second);
  });

  it("ne tire jamais deux fois la même cible", () => {
    const picks = pickTargets(pool.ids, 15, rngFromSeed("test"));
    expect(new Set(picks).size).toBe(15);
  });

  it("ne tire que des ids du pool", () => {
    const gen5 = buildPool([5]);
    const picks = pickTargets(gen5.ids, 10, rngFromSeed("test"));
    for (const id of picks) {
      expect(id).toBeGreaterThanOrEqual(494);
      expect(id).toBeLessThanOrEqual(649);
    }
  });

  it("plafonne au nombre d'éléments du pool", () => {
    expect(pickTargets([1, 2, 3], 10, rngFromSeed("test"))).toHaveLength(3);
  });

  it("retourne un tableau vide pour count négatif", () => {
    expect(pickTargets([1, 2, 3], -3, rngFromSeed("test"))).toHaveLength(0);
  });

  it("ne modifie pas le tableau source", () => {
    const ids = [...pool.ids];
    pickTargets(ids, 10, rngFromSeed("test"));
    expect(ids).toEqual(pool.ids);
  });

  // Frozen regression test for pickTargets: asserts that the exact sequence of ten picks
  // for the daily:2026-09-04 seed has not drifted. These values were obtained by running
  // the current correct implementation once; they cannot prove the algorithm is right,
  // only that it has not silently changed.
  it("produit les valeurs gelées pour daily:2026-09-04", () => {
    expect(pickTargets(pool.ids, 10, rngFromSeed("daily:2026-09-04"))).toEqual([
      84, 51, 9, 132, 29, 122, 21, 136, 98, 101,
    ]);
  });

  it("répartit à peu près uniformément sur 100 000 tirages", () => {
    const counts = new Map<number, number>();
    const rng = rngFromSeed("uniformité");
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const [id] = pickTargets(pool.ids, 1, rng);
      counts.set(id!, (counts.get(id!) ?? 0) + 1);
    }
    const expectedPerId = draws / pool.ids.length;
    for (const id of pool.ids) {
      const seen = counts.get(id) ?? 0;
      expect(seen).toBeGreaterThan(expectedPerId * 0.8);
      expect(seen).toBeLessThan(expectedPerId * 1.2);
    }
  });
});

describe("randomSeed", () => {
  it("préfixe et produit 16 caractères hexadécimaux", () => {
    expect(randomSeed()).toMatch(/^solo:[0-9a-f]{16}$/);
    expect(randomSeed()).not.toBe(randomSeed());
  });
});
