import { describe, expect, it } from "vitest";
import { DAILY_SETTINGS, dailyKey, dailySeed, shareText, tierOf } from "./daily.js";

describe("dailyKey", () => {
  it("utilise la date UTC", () => {
    expect(dailyKey(new Date("2026-09-04T00:00:00Z"))).toBe("2026-09-04");
    expect(dailyKey(new Date("2026-09-04T23:59:59Z"))).toBe("2026-09-04");
    expect(dailyKey(new Date("2026-09-05T00:00:00Z"))).toBe("2026-09-05");
  });

  it("bascule à minuit UTC et non à minuit local", () => {
    // 01h30 à Paris en été = 23h30 UTC la veille : le défi de la veille est encore actif.
    expect(dailyKey(new Date("2026-09-04T23:30:00Z"))).toBe("2026-09-04");
    // 02h30 à Paris = 00h30 UTC : on est passé au défi suivant.
    expect(dailyKey(new Date("2026-09-05T00:30:00Z"))).toBe("2026-09-05");
  });
});

describe("dailySeed", () => {
  it("est stable dans la journée et change le lendemain", () => {
    expect(dailySeed(new Date("2026-09-04T08:00:00Z"))).toBe("daily:2026-09-04");
    expect(dailySeed(new Date("2026-09-04T20:00:00Z"))).toBe("daily:2026-09-04");
    expect(dailySeed(new Date("2026-09-05T08:00:00Z"))).toBe("daily:2026-09-05");
  });
});

describe("DAILY_SETTINGS", () => {
  it("est le pool national, 15 secondes, 10 manches", () => {
    expect(DAILY_SETTINGS).toEqual({
      generations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      roundDurationMs: 15000,
      roundCount: 10,
    });
  });
});

describe("tierOf", () => {
  it("applique les paliers normatifs", () => {
    expect(tierOf(1000)).toBe(4);
    expect(tierOf(999)).toBe(3);
    expect(tierOf(700)).toBe(3);
    expect(tierOf(699)).toBe(2);
    expect(tierOf(400)).toBe(2);
    expect(tierOf(399)).toBe(1);
    expect(tierOf(150)).toBe(1);
    expect(tierOf(149)).toBe(0);
    expect(tierOf(0)).toBe(0);
  });
});

describe("shareText", () => {
  it("produit le format de partage attendu", () => {
    const text = shareText({
      date: new Date("2026-09-04T10:00:00Z"),
      total: 7842,
      points: [1000, 800, 500, 100, 750, 1000, 450, 20, 200, 900],
      url: "https://exemple.fr/daily",
    });
    expect(text).toBe(
      [
        "Pokémon Find — 2026-09-04",
        "7 842 / 10 000",
        "🟦🟩🟨⬛🟩🟦🟨⬛🟧🟩",
        "https://exemple.fr/daily",
      ].join("\n"),
    );
  });
});
