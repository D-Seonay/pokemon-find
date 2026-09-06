import { describe, expect, it } from "vitest";
import { formatPokedexNumber } from "./format.js";

describe("formatPokedexNumber", () => {
  it("complète sur 3 chiffres quand le pool tient sous 1000", () => {
    expect(formatPokedexNumber(25, 151)).toBe("#025");
  });

  it("complète sur 4 chiffres pour le pool national", () => {
    expect(formatPokedexNumber(782, 1025)).toBe("#0782");
  });

  it("épingle la frontière : maxId = 999 rend 3 chiffres", () => {
    expect(formatPokedexNumber(7, 999)).toBe("#007");
  });

  it("épingle la frontière : maxId = 1000 rend 4 chiffres", () => {
    expect(formatPokedexNumber(7, 1000)).toBe("#0007");
  });

  it("ne tronque jamais un numéro plus long que le remplissage", () => {
    expect(formatPokedexNumber(1025, 151)).toBe("#1025");
  });
});
