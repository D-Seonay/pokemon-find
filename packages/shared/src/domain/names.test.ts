import { describe, expect, it } from "vitest";
import { normalizeName, searchPokemon } from "./names.js";
import { buildPool } from "./pool.js";

describe("normalizeName", () => {
  it("met en minuscules et retire les espaces de bordure", () => {
    expect(normalizeName("  PiKaChu ")).toBe("pikachu");
  });

  it("retire les accents", () => {
    expect(normalizeName("Étourmi")).toBe("etourmi");
    expect(normalizeName("Éoko")).toBe("eoko");
  });

  it("traduit les signes de genre", () => {
    expect(normalizeName("Nidoran♀")).toBe("nidoranf");
    expect(normalizeName("Nidoran♂")).toBe("nidoranm");
  });

  it("distingue les deux Nidoran", () => {
    expect(normalizeName("Nidoran♀")).not.toBe(normalizeName("Nidoran♂"));
  });

  it("retire ponctuation, espaces internes et tirets", () => {
    expect(normalizeName("M. Mime")).toBe("mmime");
    expect(normalizeName("Mime Jr.")).toBe("mimejr");
    expect(normalizeName("Ho-Oh")).toBe("hooh");
    expect(normalizeName("Porygon-Z")).toBe("porygonz");
    expect(normalizeName("Farfetch'd")).toBe("farfetchd");
    expect(normalizeName("Farfetch’d")).toBe("farfetchd");
    expect(normalizeName("Tapu Koko")).toBe("tapukoko");
  });

  it("conserve les chiffres", () => {
    expect(normalizeName("Type:0")).toBe("type0");
  });

  it("renvoie une chaîne vide pour une saisie sans caractère utile", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("!?-.")).toBe("");
  });
});

describe("searchPokemon", () => {
  const gen1 = buildPool([1]);
  const national = buildPool([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it("renvoie une liste vide pour une requête vide ou sans caractère utile", () => {
    expect(searchPokemon("", gen1)).toEqual([]);
    expect(searchPokemon("   ", gen1)).toEqual([]);
    expect(searchPokemon("!!", gen1)).toEqual([]);
  });

  it("place le préfixe français en tête", () => {
    const results = searchPokemon("pika", gen1);
    expect(results[0]?.id).toBe(25);
  });

  it("trouve par le nom anglais", () => {
    const results = searchPokemon("charizard", gen1);
    expect(results[0]?.id).toBe(6);
  });

  it("tolère accents, casse et ponctuation dans la requête", () => {
    expect(searchPokemon("m. mime", national)[0]?.id).toBe(122);
    expect(searchPokemon("HO-OH", national)[0]?.id).toBe(250);
  });

  it("classe les préfixes avant les sous-chaînes", () => {
    const results = searchPokemon("chu", national);
    const prefixIndex = results.findIndex((p) => p.slugFr.startsWith("chu"));
    const substringIndex = results.findIndex((p) => !p.slugFr.startsWith("chu"));
    if (prefixIndex !== -1 && substringIndex !== -1) {
      expect(prefixIndex).toBeLessThan(substringIndex);
    }
  });

  it("respecte strictement le pool", () => {
    expect(searchPokemon("mewtwo", buildPool([5]))).toEqual([]);
    expect(searchPokemon("mewtwo", gen1)[0]?.id).toBe(150);
  });

  it("plafonne à 8 résultats par défaut", () => {
    expect(searchPokemon("a", national).length).toBeLessThanOrEqual(8);
    expect(searchPokemon("a", national, 3)).toHaveLength(3);
  });

  it("départage les égalités par numéro croissant", () => {
    const results = searchPokemon("nidoran", national);
    expect(results.map((p) => p.id)).toEqual([29, 32]);
  });
});
