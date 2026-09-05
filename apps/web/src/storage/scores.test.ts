import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { afterEach, describe, expect, it } from "vitest";
import { bestKey, readBest, saveBest } from "./scores.js";

afterEach(() => localStorage.clear());

describe("meilleurs scores", () => {
  it("construit une clé stable à partir des réglages", () => {
    expect(bestKey(DEFAULT_SETTINGS)).toBe("1|15000|10");
    expect(bestKey({ ...DEFAULT_SETTINGS, generations: [3, 1] })).toBe("1-3|15000|10");
  });

  it("enregistre un premier score", () => {
    expect(saveBest(DEFAULT_SETTINGS, 5000)).toBe(true);
    expect(readBest(DEFAULT_SETTINGS)?.score).toBe(5000);
  });

  it("n'écrase que sur un score strictement supérieur", () => {
    saveBest(DEFAULT_SETTINGS, 5000);
    expect(saveBest(DEFAULT_SETTINGS, 5000)).toBe(false);
    expect(saveBest(DEFAULT_SETTINGS, 4999)).toBe(false);
    expect(saveBest(DEFAULT_SETTINGS, 5001)).toBe(true);
    expect(readBest(DEFAULT_SETTINGS)?.score).toBe(5001);
  });

  it("sépare les scores par configuration", () => {
    saveBest(DEFAULT_SETTINGS, 5000);
    expect(readBest({ ...DEFAULT_SETTINGS, roundCount: 5 })).toBeNull();
  });
});
