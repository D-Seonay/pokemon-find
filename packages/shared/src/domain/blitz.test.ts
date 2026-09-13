import { describe, expect, it } from "vitest";
import { buildPool } from "./pool.js";
import {
  BLITZ_DURATIONS,
  DEFAULT_BLITZ_SETTINGS,
  matchPokemonName,
  validateBlitzSettings,
} from "./blitz.js";

const gen1 = buildPool([1]);

describe("validateBlitzSettings", () => {
  it("accepte les réglages par défaut", () => {
    expect(validateBlitzSettings(DEFAULT_BLITZ_SETTINGS)).toEqual(DEFAULT_BLITZ_SETTINGS);
  });

  it("refuse une durée hors liste", () => {
    expect(() => validateBlitzSettings({ generations: [1], durationMs: 42 })).toThrow();
  });

  it("refuse une sélection de générations vide", () => {
    expect(() => validateBlitzSettings({ generations: [], durationMs: 60_000 })).toThrow();
  });

  it("déduplique et ordonne les générations", () => {
    const s = validateBlitzSettings({ generations: [3, 1, 3], durationMs: 60_000 });
    expect(s.generations).toEqual([1, 3]);
  });

  it("propose quatre durées, d'une à dix minutes", () => {
    expect([...BLITZ_DURATIONS]).toEqual([60_000, 180_000, 300_000, 600_000]);
  });
});

describe("matchPokemonName", () => {
  it("reconnaît le nom français", () => {
    expect(matchPokemonName("Bulbizarre", gen1)?.id).toBe(1);
  });

  it("reconnaît le nom anglais", () => {
    expect(matchPokemonName("Bulbasaur", gen1)?.id).toBe(1);
  });

  it("ignore la casse, les accents et la ponctuation", () => {
    expect(matchPokemonName("  MÉLOFÉE ", gen1)?.id).toBe(35);
    expect(matchPokemonName("m. mime", gen1)?.id).toBe(122);
  });

  // Le point qui compte : la validation étant automatique à la frappe, accepter un
  // préfixe enregistrerait « Rat » au lieu de « Rattata » avant la fin du mot.
  it("exige une correspondance exacte, jamais un préfixe", () => {
    expect(matchPokemonName("Rat", gen1)).toBeUndefined();
    expect(matchPokemonName("Rattata", gen1)?.id).toBe(19);
  });

  it("ne trouve rien hors du pool choisi", () => {
    // Héricendre est de génération 2.
    expect(matchPokemonName("Héricendre", gen1)).toBeUndefined();
  });

  it("ne trouve rien sur une saisie vide", () => {
    expect(matchPokemonName("   ", gen1)).toBeUndefined();
  });
});
