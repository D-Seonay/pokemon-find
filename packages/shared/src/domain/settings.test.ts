import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  InvalidSettingsError,
  UNLIMITED_ROUND_MS,
  isUnlimitedRound,
  validateGameMode,
  validateSettings,
} from "./settings.js";

describe("validateSettings", () => {
  it("accepte les réglages par défaut", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("a des valeurs par défaut conformes à la spécification", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      generations: [1],
      roundDurationMs: 15000,
      roundCount: 10,
    });
  });

  it("trie et déduplique les générations", () => {
    const settings = validateSettings({
      generations: [3, 1, 3],
      roundDurationMs: 10000,
      roundCount: 5,
    });
    expect(settings.generations).toEqual([1, 3]);
  });

  it("rejette une durée non autorisée", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, roundDurationMs: 12000 })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette un nombre de manches non autorisé", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, roundCount: 7 })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette une liste de générations vide ou invalide", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: [] })).toThrow(
      InvalidSettingsError,
    );
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: [12] })).toThrow(
      InvalidSettingsError,
    );
  });

  it("rejette une entrée qui n'est pas un objet", () => {
    expect(() => validateSettings(null)).toThrow(InvalidSettingsError);
    expect(() => validateSettings("gen1")).toThrow(InvalidSettingsError);
  });

  it("rejette quand generations n'est pas un tableau", () => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: "gen1" })).toThrow(
      InvalidSettingsError,
    );
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, generations: 123 })).toThrow(
      InvalidSettingsError,
    );
  });
});

describe("durée sans limite", () => {
  it("est exprimée par zéro, et non par Infinity qui ne survit pas au JSON", () => {
    expect(UNLIMITED_ROUND_MS).toBe(0);
    // La garde qui justifie ce choix : Infinity se sérialise en null.
    expect(JSON.parse(JSON.stringify({ ms: Infinity })).ms).toBeNull();
    expect(JSON.parse(JSON.stringify({ ms: UNLIMITED_ROUND_MS })).ms).toBe(0);
  });

  it("fait partie des durées acceptées par la validation", () => {
    const settings = validateSettings({
      generations: [1],
      roundDurationMs: UNLIMITED_ROUND_MS,
      roundCount: 10,
    });
    expect(settings.roundDurationMs).toBe(0);
    expect(isUnlimitedRound(settings.roundDurationMs)).toBe(true);
  });

  it("accepte aussi la minute", () => {
    const settings = validateSettings({ generations: [1], roundDurationMs: 60000, roundCount: 10 });
    expect(settings.roundDurationMs).toBe(60000);
    expect(isUnlimitedRound(settings.roundDurationMs)).toBe(false);
  });

  it("refuse toujours une durée hors liste", () => {
    expect(() =>
      validateSettings({ generations: [1], roundDurationMs: 42, roundCount: 10 }),
    ).toThrow();
  });
});

describe("validateGameMode", () => {
  it("accepte les deux modes de jeu d'une room", () => {
    expect(validateGameMode("classic")).toBe("classic");
    expect(validateGameMode("blitz")).toBe("blitz");
  });

  it("refuse un mode inconnu plutôt que de le laisser passer", () => {
    expect(() => validateGameMode("solo")).toThrow(InvalidSettingsError);
    expect(() => validateGameMode(undefined)).toThrow(InvalidSettingsError);
    expect(() => validateGameMode(0)).toThrow(InvalidSettingsError);
  });
});
