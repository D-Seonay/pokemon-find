import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, InvalidSettingsError, validateSettings } from "./settings.js";

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
