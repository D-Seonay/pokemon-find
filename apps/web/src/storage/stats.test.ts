import { afterEach, describe, expect, it } from "vitest";
import type { SoloRound } from "../game/useSoloGame.js";
import { KEYS } from "./local.js";
import {
  MIN_GENERATION_SAMPLE,
  SOLO_HISTORY_LIMIT,
  computeStats,
  readSoloHistory,
  readSoloStats,
  recordSoloGame,
} from "./stats.js";

afterEach(() => localStorage.clear());

function round(targetId: number, answerId: number | null): SoloRound {
  return { targetId, answerId, points: answerId === null ? 0 : 500, responseTimeMs: 1000 };
}

describe("readSoloHistory", () => {
  it("renvoie un historique vide quand rien n'est stocké", () => {
    expect(readSoloHistory()).toEqual([]);
  });

  it("survit à une valeur stockée qui n'est pas un tableau", () => {
    localStorage.setItem(KEYS.soloHistory, JSON.stringify("corrompu"));
    expect(readSoloHistory()).toEqual([]);
  });

  it("survit à un JSON invalide", () => {
    localStorage.setItem(KEYS.soloHistory, "{pas du json");
    expect(readSoloHistory()).toEqual([]);
  });

  it("écarte les entrées mal formées sans jeter les bonnes", () => {
    localStorage.setItem(
      KEYS.soloHistory,
      JSON.stringify([
        { date: "2026-09-01T00:00:00.000Z", rounds: [{ targetId: 1, gap: 0 }] },
        { date: 42, rounds: [] },
        null,
        { date: "2026-09-02T00:00:00.000Z", rounds: [{ targetId: 1, gap: "loin" }] },
        { date: "2026-09-03T00:00:00.000Z", rounds: [{ targetId: 5, gap: null }] },
      ]),
    );
    expect(readSoloHistory().map((entry) => entry.date)).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-09-03T00:00:00.000Z",
    ]);
  });
});

describe("recordSoloGame", () => {
  it("ajoute une partie et la retrouve dans l'historique", () => {
    recordSoloGame([round(1, 1), round(2, 5)]);
    const history = readSoloHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.rounds).toEqual([
      { targetId: 1, gap: 0 },
      { targetId: 2, gap: 3 },
    ]);
  });

  it("représente un timeout par un écart nul (pas zéro)", () => {
    recordSoloGame([round(1, null)]);
    expect(readSoloHistory()[0]?.rounds).toEqual([{ targetId: 1, gap: null }]);
  });

  it("plafonne l'historique en gardant les parties les plus récentes", () => {
    for (let i = 0; i < SOLO_HISTORY_LIMIT + 5; i++) {
      recordSoloGame([round(1, 1)]);
    }
    expect(readSoloHistory()).toHaveLength(SOLO_HISTORY_LIMIT);
  });

  it("n'explose pas quand l'écriture échoue", () => {
    localStorage.setItem(KEYS.soloHistory, JSON.stringify("corrompu"));
    expect(() => recordSoloGame([round(1, 1)])).not.toThrow();
    expect(readSoloHistory()).toHaveLength(1);
  });
});

describe("computeStats", () => {
  it("ne compte aucune manche sans historique", () => {
    const stats = computeStats([]);
    expect(stats).toEqual({
      roundsPlayed: 0,
      averageGap: null,
      exactHits: 0,
      weakestGeneration: null,
    });
  });

  it("calcule l'écart moyen et le nombre de réponses exactes en ignorant les timeouts", () => {
    const stats = computeStats([
      {
        date: "d1",
        rounds: [
          { targetId: 1, gap: 0 },
          { targetId: 2, gap: 10 },
          { targetId: 3, gap: null },
        ],
      },
    ]);
    expect(stats.roundsPlayed).toBe(2);
    expect(stats.averageGap).toBe(5);
    expect(stats.exactHits).toBe(1);
  });

  it("ne désigne pas de génération faible avant le seuil minimal d'échantillon", () => {
    // Génération 1 (ids 1-151) : une seule manche avec un très mauvais écart. Une génération
    // vue une fois ne doit pas être qualifiée de "la plus faible" — le bruit d'une seule
    // mauvaise manche n'est pas une preuve.
    const rounds = [{ targetId: 1, gap: 500 }];
    expect(MIN_GENERATION_SAMPLE).toBeGreaterThan(1);
    const stats = computeStats([{ date: "d1", rounds }]);
    expect(stats.weakestGeneration).toBeNull();
  });

  it("désigne la génération au pire écart moyen une fois le seuil atteint", () => {
    const gen1Rounds = Array.from({ length: MIN_GENERATION_SAMPLE }, () => ({
      targetId: 1,
      gap: 50,
    }));
    const gen2Rounds = Array.from({ length: MIN_GENERATION_SAMPLE }, () => ({
      targetId: 152,
      gap: 5,
    }));
    const stats = computeStats([{ date: "d1", rounds: [...gen1Rounds, ...gen2Rounds] }]);
    expect(stats.weakestGeneration).toBe(1);
  });
});

describe("readSoloStats", () => {
  it("combine l'historique stocké pour produire les statistiques", () => {
    recordSoloGame([round(1, 1), round(2, 12)]);
    const stats = readSoloStats();
    expect(stats.roundsPlayed).toBe(2);
    expect(stats.exactHits).toBe(1);
  });
});
