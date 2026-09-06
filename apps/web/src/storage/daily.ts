import { KEYS, readJson, writeJson } from "./local.js";

/** Un défi du jour terminé : la date UTC, le total, et les points manche par manche. */
export type DailyEntry = { date: string; total: number; points: number[] };

/** Nombre de jours conservés. Au-delà, les plus anciens sont oubliés. */
export const DAILY_HISTORY_LIMIT = 30;

// La valeur stockée vient du navigateur et peut avoir n'importe quelle forme : une
// version antérieure de l'app, un autre onglet, une édition manuelle. On la valide
// entrée par entrée plutôt que de faire confiance au type déclaré — un cast qui ment
// a déjà produit un crash à l'écriture dans ce projet.
function asEntry(value: unknown): DailyEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.date !== "string" || candidate.date === "") return null;
  if (typeof candidate.total !== "number") return null;
  if (!Array.isArray(candidate.points)) return null;
  const points = candidate.points.filter((point): point is number => typeof point === "number");
  if (points.length !== candidate.points.length) return null;
  return { date: candidate.date, total: candidate.total, points };
}

export function readHistory(): DailyEntry[] {
  const raw = readJson<unknown>(KEYS.dailyHistory, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asEntry)
    .filter((entry): entry is DailyEntry => entry !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Enregistre un défi terminé et renvoie l'historique à jour. Rejouer le même jour remplace. */
export function recordDaily(entry: DailyEntry): DailyEntry[] {
  const kept = readHistory().filter((item) => item.date !== entry.date);
  const history = [...kept, entry]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-DAILY_HISTORY_LIMIT);
  writeJson(KEYS.dailyHistory, history);
  return history;
}

/** La veille d'une date `YYYY-MM-DD`, en UTC — le calendrier gère seul mois et années. */
function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Nombre de jours consécutifs joués en terminant par `today`. Vaut zéro si le jour
 * courant n'a pas été joué : la série s'affiche sur l'écran de résultat, qui n'apparaît
 * qu'une fois la partie du jour finie.
 */
export function currentStreak(history: readonly DailyEntry[], today: string): number {
  const played = new Set(history.map((entry) => entry.date));
  let streak = 0;
  let cursor = today;
  while (played.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}
