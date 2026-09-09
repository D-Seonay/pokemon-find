import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, isValidRoomCode, sanitizeRoomCodeInput } from "./roomCode.js";

describe("alphabet des codes", () => {
  it("exclut les caractères qu'on confond à l'oral", () => {
    for (const char of "IO01") {
      expect(CODE_ALPHABET).not.toContain(char);
    }
  });

  it("n'a pas de doublon", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});

describe("isValidRoomCode", () => {
  it("accepte un code bien formé", () => {
    expect(isValidRoomCode("AB23")).toBe(true);
  });

  it("refuse une longueur incorrecte", () => {
    expect(isValidRoomCode("AB2")).toBe(false);
    expect(isValidRoomCode("AB234")).toBe(false);
  });

  it("refuse un caractère hors alphabet, y compris les confusables", () => {
    expect(isValidRoomCode("AB2O")).toBe(false);
    expect(isValidRoomCode("AB20")).toBe(false);
    expect(isValidRoomCode("12!@")).toBe(false);
  });

  it("refuse les minuscules : un code est en majuscules", () => {
    expect(isValidRoomCode("ab23")).toBe(false);
  });
});

describe("sanitizeRoomCodeInput", () => {
  it("met en majuscules", () => {
    expect(sanitizeRoomCodeInput("ab23")).toBe("AB23");
  });

  it("retire ce qui n'appartient pas à l'alphabet", () => {
    expect(sanitizeRoomCodeInput("A!B@2#3")).toBe("AB23");
  });

  it("tronque au-delà de la longueur d'un code", () => {
    expect(sanitizeRoomCodeInput("ABCDEFGH")).toBe("ABCD");
  });

  it("supporte le collage d'un code entouré de texte", () => {
    // Le cas réel : un code copié depuis un message, avec des espaces autour.
    expect(sanitizeRoomCodeInput("  ab23  ")).toBe("AB23");
  });

  it("ne produit jamais une valeur que isValidRoomCode refuserait, à longueur pleine", () => {
    const result = sanitizeRoomCodeInput("xyz789abc");
    expect(result).toHaveLength(CODE_LENGTH);
    expect(isValidRoomCode(result)).toBe(true);
  });
});
