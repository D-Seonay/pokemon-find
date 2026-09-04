import { describe, expect, it } from "vitest";
import { normalizeName } from "./names.js";

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
