import { describe, expect, it } from "vitest";
import { MAX_SCORE, gapBetween, scoreForAnswer } from "./score.js";

describe("scoreForAnswer", () => {
  it("reproduit le tableau de référence en Gén 1 (span 151)", () => {
    const table: Array<[number, number]> = [
      [0, 1000],
      [1, 936],
      [5, 718],
      [15, 370],
      [50, 36],
      [100, 1],
      [400, 0],
    ];
    for (const [gap, points] of table) {
      expect(scoreForAnswer(500, 500 + gap, 151)).toBe(points);
    }
  });

  it("reproduit le tableau de référence en national (span 1025)", () => {
    const table: Array<[number, number]> = [
      [0, 1000],
      [1, 990],
      [5, 952],
      [15, 864],
      [50, 614],
      [100, 377],
      [400, 20],
    ];
    for (const [gap, points] of table) {
      expect(scoreForAnswer(500, 500 + gap, 1025)).toBe(points);
    }
  });

  it("est symétrique autour de la cible", () => {
    expect(scoreForAnswer(25, 20, 151)).toBe(scoreForAnswer(25, 30, 151));
  });

  it("donne le maximum pour une réponse exacte", () => {
    expect(scoreForAnswer(143, 143, 1025)).toBe(MAX_SCORE);
  });

  it("donne zéro sans réponse", () => {
    expect(scoreForAnswer(143, null, 1025)).toBe(0);
  });

  it("reste un entier dans [0, 1000]", () => {
    for (let gap = 0; gap <= 1024; gap++) {
      const points = scoreForAnswer(1, 1 + gap, 1025);
      expect(Number.isInteger(points)).toBe(true);
      expect(points).toBeGreaterThanOrEqual(0);
      expect(points).toBeLessThanOrEqual(MAX_SCORE);
    }
  });
});

describe("gapBetween", () => {
  it("renvoie une valeur absolue", () => {
    expect(gapBetween(25, 30)).toBe(5);
    expect(gapBetween(30, 25)).toBe(5);
  });
});
