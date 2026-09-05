import { type GameSettings, poolSignature } from "@pkfind/shared";
import { KEYS, readJson, writeJson } from "./local.js";

export type BestEntry = { score: number; date: string };

// Ce que readJson peut renvoyer une fois le JSON parsé : la forme n'est plus garantie
// au-delà de "c'est du JSON valide", donc chaque champ reste à valider à l'exécution.
type BestMap = Record<string, unknown>;

// Un objet plan (ni null, ni tableau) est la seule forme qu'on accepte comme table de
// scores ; tout le reste (primitif, tableau, valeur corrompue) redémarre à zéro plutôt
// que de faire planter l'écriture ou de perdre silencieusement les données au sérialisage.
function asBestMap(value: unknown): BestMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as BestMap;
}

function asBestEntry(value: unknown): BestEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.score !== "number") return null;
  return { score: candidate.score, date: typeof candidate.date === "string" ? candidate.date : "" };
}

export function bestKey(settings: GameSettings): string {
  return `${poolSignature(settings.generations)}|${settings.roundDurationMs}|${settings.roundCount}`;
}

export function readBest(settings: GameSettings): BestEntry | null {
  const map = asBestMap(readJson<unknown>(KEYS.best, {}));
  return asBestEntry(map[bestKey(settings)]);
}

export function saveBest(settings: GameSettings, score: number): boolean {
  const map = asBestMap(readJson<unknown>(KEYS.best, {}));
  const key = bestKey(settings);
  const previous = asBestEntry(map[key]);
  if (previous && score <= previous.score) return false;
  map[key] = { score, date: new Date().toISOString() };
  writeJson(KEYS.best, map);
  return true;
}
