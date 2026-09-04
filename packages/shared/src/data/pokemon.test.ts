import { describe, expect, it } from "vitest";
import { GENERATION_BOUNDS, MAX_POKEMON_ID } from "../domain/generations.js";
import { normalizeName } from "../domain/names.js";
import { buildPool } from "../domain/pool.js";
import { POKEMON, pokemonById, pokemonOfPool, tryPokemonById } from "./pokemon.js";

describe("dataset", () => {
  it("contient 1025 entrées triées, sans trou", () => {
    expect(POKEMON).toHaveLength(MAX_POKEMON_ID);
    POKEMON.forEach((p, index) => expect(p.id).toBe(index + 1));
  });

  it("a des slugs uniques", () => {
    expect(new Set(POKEMON.map((p) => p.slugFr)).size).toBe(MAX_POKEMON_ID);
    expect(new Set(POKEMON.map((p) => p.slugEn)).size).toBe(MAX_POKEMON_ID);
  });

  it("a des slugs cohérents avec les noms", () => {
    for (const p of POKEMON) {
      expect(p.slugFr).toBe(normalizeName(p.nameFr));
      expect(p.slugEn).toBe(normalizeName(p.nameEn));
      expect(p.slugFr.length).toBeGreaterThan(0);
    }
  });

  it("a une génération cohérente avec les bornes normatives", () => {
    for (const p of POKEMON) {
      const [first, last] = GENERATION_BOUNDS[p.generation];
      expect(p.id).toBeGreaterThanOrEqual(first);
      expect(p.id).toBeLessThanOrEqual(last);
    }
  });

  it("a une URL de sprite conforme", () => {
    for (const p of POKEMON) {
      expect(p.spriteUrl).toBe(
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`,
      );
    }
  });

  it("contient les cas particuliers attendus", () => {
    expect(pokemonById(25).nameFr).toBe("Pikachu");
    expect(pokemonById(29).slugFr).toBe("nidoranf");
    expect(pokemonById(32).slugFr).toBe("nidoranm");
    expect(pokemonById(122).slugFr).toBe("mmime");
    expect(pokemonById(83).slugEn).toBe("farfetchd");
    expect(pokemonById(250).slugFr).toBe("hooh");
    expect(pokemonById(474).slugFr).toBe("porygonz");
    expect(pokemonById(772).slugFr).toBe("type0");
  });
});

describe("accès", () => {
  it("trouve un Pokémon par son numéro", () => {
    expect(pokemonById(1).id).toBe(1);
    expect(pokemonById(1025).id).toBe(1025);
  });

  it("lève pour un numéro inconnu et renvoie undefined en variante souple", () => {
    expect(() => pokemonById(9999)).toThrow(RangeError);
    expect(tryPokemonById(9999)).toBeUndefined();
  });

  it("restreint au pool", () => {
    const gen1 = pokemonOfPool(buildPool([1]));
    expect(gen1).toHaveLength(151);
    expect(gen1.every((p) => p.generation === 1)).toBe(true);
  });
});
