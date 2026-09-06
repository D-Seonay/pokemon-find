import { afterEach, describe, expect, it } from "vitest";
import {
  DAILY_HISTORY_LIMIT,
  type DailyEntry,
  currentStreak,
  readHistory,
  recordDaily,
} from "./daily.js";
import { KEYS } from "./local.js";

afterEach(() => localStorage.clear());

function entry(date: string, total = 5000): DailyEntry {
  return { date, total, points: [1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0, 0] };
}

describe("readHistory", () => {
  it("renvoie un historique vide quand rien n'est stocké", () => {
    expect(readHistory()).toEqual([]);
  });

  it("survit à une valeur stockée qui n'est pas un tableau", () => {
    localStorage.setItem(KEYS.dailyHistory, JSON.stringify("corrompu"));
    expect(readHistory()).toEqual([]);
  });

  it("survit à un JSON invalide", () => {
    localStorage.setItem(KEYS.dailyHistory, "{pas du json");
    expect(readHistory()).toEqual([]);
  });

  it("écarte les entrées mal formées sans jeter les bonnes", () => {
    localStorage.setItem(
      KEYS.dailyHistory,
      JSON.stringify([entry("2026-09-01"), { date: 42 }, null, { total: 10 }, entry("2026-09-02")]),
    );
    expect(readHistory().map((item) => item.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("recordDaily", () => {
  it("ajoute une première entrée", () => {
    recordDaily(entry("2026-09-04"));
    expect(readHistory()).toHaveLength(1);
  });

  it("conserve les entrées triées par date croissante", () => {
    recordDaily(entry("2026-09-05"));
    recordDaily(entry("2026-09-03"));
    expect(readHistory().map((item) => item.date)).toEqual(["2026-09-03", "2026-09-05"]);
  });

  it("remplace l'entrée du même jour au lieu de la dupliquer", () => {
    recordDaily(entry("2026-09-04", 1000));
    recordDaily(entry("2026-09-04", 7000));
    const history = readHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.total).toBe(7000);
  });

  it("plafonne l'historique en gardant les jours les plus récents", () => {
    for (let day = 1; day <= DAILY_HISTORY_LIMIT + 5; day++) {
      recordDaily(entry(`2026-09-${String(day).padStart(2, "0")}`));
    }
    const history = readHistory();
    expect(history).toHaveLength(DAILY_HISTORY_LIMIT);
    expect(history[0]?.date).toBe("2026-09-06");
    expect(history.at(-1)?.date).toBe(`2026-09-${DAILY_HISTORY_LIMIT + 5}`);
  });

  it("n'explose pas quand l'écriture échoue", () => {
    localStorage.setItem(KEYS.dailyHistory, JSON.stringify("corrompu"));
    expect(() => recordDaily(entry("2026-09-04"))).not.toThrow();
    expect(readHistory()).toHaveLength(1);
  });
});

describe("currentStreak", () => {
  it("vaut zéro sans historique", () => {
    expect(currentStreak([], "2026-09-04")).toBe(0);
  });

  it("vaut un pour une seule partie aujourd'hui", () => {
    expect(currentStreak([entry("2026-09-04")], "2026-09-04")).toBe(1);
  });

  it("compte les jours consécutifs qui finissent aujourd'hui", () => {
    const history = [entry("2026-09-02"), entry("2026-09-03"), entry("2026-09-04")];
    expect(currentStreak(history, "2026-09-04")).toBe(3);
  });

  it("s'arrête au premier jour manquant", () => {
    const history = [entry("2026-09-01"), entry("2026-09-03"), entry("2026-09-04")];
    expect(currentStreak(history, "2026-09-04")).toBe(2);
  });

  it("vaut zéro si le jour courant n'a pas été joué", () => {
    expect(currentStreak([entry("2026-09-03")], "2026-09-04")).toBe(0);
  });

  it("traverse un changement de mois", () => {
    const history = [entry("2026-08-31"), entry("2026-09-01")];
    expect(currentStreak(history, "2026-09-01")).toBe(2);
  });

  it("traverse un changement d'année", () => {
    const history = [entry("2026-12-31"), entry("2027-01-01")];
    expect(currentStreak(history, "2027-01-01")).toBe(2);
  });
});
