import { type GenerationId, gapBetween, generationOf } from "@pkfind/shared";
import type { SoloRound } from "../game/useSoloGame.js";
import { KEYS, readJson, writeJson } from "./local.js";

/**
 * Une manche historisée : juste assez pour recalculer l'écart moyen, le nombre de
 * réponses exactes et la génération la plus faible, sans avoir à rejouer la partie.
 * `gap` vaut `null` sur un timeout (aucune réponse donnée, donc aucun écart mesurable).
 */
export type StatsRound = { targetId: number; gap: number | null };

/** Une partie solo terminée, réduite à ce qui alimente les statistiques. */
export type SoloHistoryEntry = { date: string; rounds: StatsRound[] };

/**
 * Nombre de parties conservées. Une partie compte au plus 15 manches (le maximum de
 * `ROUND_COUNTS`), donc 50 parties représentent au plus 750 petits enregistrements
 * (un id et un écart) — largement sous les quotas usuels de localStorage — tout en
 * couvrant plusieurs semaines de jeu régulier, un horizon assez long pour que la
 * génération la plus faible reflète une tendance plutôt qu'une seule mauvaise soirée.
 */
export const SOLO_HISTORY_LIMIT = 50;

/**
 * Nombre minimal de manches jouées sur une génération avant de pouvoir la désigner
 * comme « la plus faible ». Sans ce plancher, une génération vue une seule fois avec
 * un mauvais écart ressortirait toujours en tête — ce n'est pas une preuve de
 * faiblesse, juste un échantillon d'un. Cinq manches correspond à la moitié d'une
 * partie courte (le minimum de `ROUND_COUNTS` est 5) : en dessous, une génération n'a
 * pas eu de quoi être représentative.
 */
export const MIN_GENERATION_SAMPLE = 5;

/** Le détail d'une génération dans le bilan, pour montrer d'où sort la conclusion. */
export type GenerationStat = {
  generation: GenerationId;
  roundsPlayed: number;
  averageGap: number;
  /** `false` tant que la génération n'a pas atteint `MIN_GENERATION_SAMPLE` manches. */
  significant: boolean;
};

export type SoloStats = {
  /** Nombre de manches historisées avec une réponse effective (hors timeouts). */
  roundsPlayed: number;
  averageGap: number | null;
  exactHits: number;
  weakestGeneration: GenerationId | null;
};

// Ce que readJson peut renvoyer une fois le JSON parsé : la forme n'est plus garantie
// au-delà de "c'est du JSON valide", donc chaque champ reste à valider à l'exécution —
// même logique que scores.ts et daily.ts.
function asStatsRound(value: unknown): StatsRound | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.targetId !== "number") return null;
  if (candidate.gap !== null && typeof candidate.gap !== "number") return null;
  return { targetId: candidate.targetId, gap: candidate.gap as number | null };
}

function asHistoryEntry(value: unknown): SoloHistoryEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.date !== "string" || candidate.date === "") return null;
  if (!Array.isArray(candidate.rounds)) return null;
  const rounds = candidate.rounds.map(asStatsRound);
  if (rounds.some((round) => round === null)) return null;
  return { date: candidate.date, rounds: rounds as StatsRound[] };
}

export function readSoloHistory(): SoloHistoryEntry[] {
  const raw = readJson<unknown>(KEYS.soloHistory, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(asHistoryEntry).filter((entry): entry is SoloHistoryEntry => entry !== null);
}

/** Réduit les manches d'une partie à ce que l'historique a besoin de retenir. */
export function toStatsRounds(rounds: readonly SoloRound[]): StatsRound[] {
  return rounds.map((round) => ({
    targetId: round.targetId,
    gap: round.answerId === null ? null : gapBetween(round.targetId, round.answerId),
  }));
}

/** Enregistre une partie terminée et renvoie l'historique à jour, plafonné. */
export function recordSoloGame(rounds: readonly SoloRound[]): SoloHistoryEntry[] {
  const entry: SoloHistoryEntry = { date: new Date().toISOString(), rounds: toStatsRounds(rounds) };
  const history = [...readSoloHistory(), entry].slice(-SOLO_HISTORY_LIMIT);
  writeJson(KEYS.soloHistory, history);
  return history;
}

/**
 * Calcule les statistiques à partir d'un historique de parties déjà validé. Les
 * timeouts (gap `null`) n'entrent dans aucun calcul : on ne peut pas mesurer un écart
 * là où le joueur n'a donné aucune réponse.
 */
export function computeStats(history: readonly SoloHistoryEntry[]): SoloStats {
  const answered: StatsRound[] = [];
  for (const game of history) {
    for (const round of game.rounds) {
      if (round.gap !== null) answered.push(round);
    }
  }

  const roundsPlayed = answered.length;
  const averageGap =
    roundsPlayed === 0
      ? null
      : answered.reduce((sum, round) => sum + (round.gap ?? 0), 0) / roundsPlayed;
  const exactHits = answered.filter((round) => round.gap === 0).length;

  const byGeneration = new Map<GenerationId, { total: number; count: number }>();
  for (const round of answered) {
    const gen = generationOf(round.targetId);
    const bucket = byGeneration.get(gen) ?? { total: 0, count: 0 };
    bucket.total += round.gap ?? 0;
    bucket.count += 1;
    byGeneration.set(gen, bucket);
  }

  let weakestGeneration: GenerationId | null = null;
  let worstAverage = -Infinity;
  for (const [gen, bucket] of byGeneration) {
    if (bucket.count < MIN_GENERATION_SAMPLE) continue;
    const average = bucket.total / bucket.count;
    if (average > worstAverage) {
      worstAverage = average;
      weakestGeneration = gen;
    }
  }

  return { roundsPlayed, averageGap, exactHits, weakestGeneration };
}

/** Lit l'historique stocké et en dérive les statistiques. */
export function readSoloStats(): SoloStats {
  return computeStats(readSoloHistory());
}

/**
 * Le bilan génération par génération, trié du plus mauvais écart au meilleur. Les
 * générations sous le seuil d'échantillon sont conservées et marquées `significant:
 * false` plutôt que masquées : cacher une ligne donnerait l'impression que la génération
 * n'a jamais été jouée, alors que le joueur l'a bien vue — simplement pas assez pour en
 * conclure quoi que ce soit.
 */
export function generationBreakdown(history: readonly SoloHistoryEntry[]): GenerationStat[] {
  const byGeneration = new Map<GenerationId, { total: number; count: number }>();
  for (const game of history) {
    for (const round of game.rounds) {
      if (round.gap === null) continue;
      const gen = generationOf(round.targetId);
      const bucket = byGeneration.get(gen) ?? { total: 0, count: 0 };
      bucket.total += round.gap;
      bucket.count += 1;
      byGeneration.set(gen, bucket);
    }
  }

  return [...byGeneration.entries()]
    .map(([generation, bucket]) => ({
      generation,
      roundsPlayed: bucket.count,
      averageGap: bucket.total / bucket.count,
      significant: bucket.count >= MIN_GENERATION_SAMPLE,
    }))
    .sort((a, b) => b.averageGap - a.averageGap);
}
