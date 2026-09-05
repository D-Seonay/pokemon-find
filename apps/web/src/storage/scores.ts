import { type GameSettings, poolSignature } from "@pkfind/shared";
import { KEYS, readJson, writeJson } from "./local.js";

export type BestEntry = { score: number; date: string };

type BestMap = Record<string, BestEntry>;

export function bestKey(settings: GameSettings): string {
  return `${poolSignature(settings.generations)}|${settings.roundDurationMs}|${settings.roundCount}`;
}

export function readBest(settings: GameSettings): BestEntry | null {
  const map = readJson<BestMap>(KEYS.best, {});
  return map[bestKey(settings)] ?? null;
}

export function saveBest(settings: GameSettings, score: number): boolean {
  const map = readJson<BestMap>(KEYS.best, {});
  const key = bestKey(settings);
  const previous = map[key];
  if (previous && score <= previous.score) return false;
  map[key] = { score, date: new Date().toISOString() };
  writeJson(KEYS.best, map);
  return true;
}
