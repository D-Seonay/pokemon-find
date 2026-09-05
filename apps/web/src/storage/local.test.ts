import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYS, readJson, removeKey, writeJson } from "./local.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("stockage tolérant", () => {
  it("écrit puis relit une valeur", () => {
    writeJson(KEYS.nickname, "Mathéo");
    expect(readJson(KEYS.nickname, "")).toBe("Mathéo");
  });

  it("renvoie la valeur de repli si la clé est absente", () => {
    expect(readJson("pkfind.absent", { a: 1 })).toEqual({ a: 1 });
  });

  it("renvoie la valeur de repli si le JSON est corrompu", () => {
    localStorage.setItem(KEYS.best, "{pas du json");
    expect(readJson(KEYS.best, null)).toBeNull();
  });

  it("n'explose pas si l'écriture échoue", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => writeJson(KEYS.nickname, "Mathéo")).not.toThrow();
  });

  it("n'explose pas si la lecture échoue", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    expect(readJson(KEYS.nickname, "repli")).toBe("repli");
  });

  it("supprime une clé", () => {
    writeJson(KEYS.daily, { date: "2026-09-04" });
    removeKey(KEYS.daily);
    expect(readJson(KEYS.daily, null)).toBeNull();
  });
});
