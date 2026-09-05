import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, normalizeCode } from "./codes.js";
import { RoomError } from "./Room.js";

describe("generateCode", () => {
  it("produit 4 caractères de l'alphabet autorisé", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("n'utilise jamais I, O, 0 ni 1", () => {
    for (const forbidden of ["I", "O", "0", "1"]) {
      expect(CODE_ALPHABET).not.toContain(forbidden);
    }
  });
});

describe("normalizeCode", () => {
  it("met en majuscules et retire les espaces", () => {
    expect(normalizeCode(" ab cd ")).toBe("ABCD");
  });

  it("rejette une longueur incorrecte", () => {
    expect(() => normalizeCode("ABC")).toThrow(RoomError);
    expect(() => normalizeCode("ABCDE")).toThrow(RoomError);
  });

  it("rejette les caractères ambigus sans les corriger", () => {
    expect(() => normalizeCode("AB0D")).toThrow(RoomError);
    expect(() => normalizeCode("ABID")).toThrow(RoomError);
  });
});
