import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applique les valeurs par défaut de la spécification", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 3000,
      logLevel: "info",
      corsOrigin: "",
      revealMs: 6000,
      countdownMs: 3000,
      answerGraceMs: 1500,
      reconnectGraceMs: 60_000,
      roomEmptyTtlMs: 300_000,
      roomMaxAgeMs: 10_800_000,
      maxRooms: 500,
    });
  });

  it("lit les variables d'environnement", () => {
    const config = loadConfig({ PORT: "8080", ROUND_REVEAL_MS: "2000", MAX_ROOMS: "10" });
    expect(config.port).toBe(8080);
    expect(config.revealMs).toBe(2000);
    expect(config.maxRooms).toBe(10);
  });

  it("refuse un port hors bornes", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "abc" })).toThrow(ConfigError);
  });

  it("refuse des durées absurdes", () => {
    expect(() => loadConfig({ ROUND_REVEAL_MS: "-1" })).toThrow(ConfigError);
    expect(() => loadConfig({ RECONNECT_GRACE_MS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ MAX_ROOMS: "0" })).toThrow(ConfigError);
  });

  it("refuse les formats numériques ambigus", () => {
    expect(() => loadConfig({ PORT: "0x10" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "3e3" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "3000.5" })).toThrow(ConfigError);
  });

  it("refuse un niveau de journalisation inconnu", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow(ConfigError);
  });
});
