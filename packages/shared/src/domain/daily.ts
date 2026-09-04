import { ALL_GENERATIONS } from "./generations.js";
import type { GameSettings } from "./settings.js";

export const DAILY_SETTINGS: GameSettings = {
  generations: [...ALL_GENERATIONS],
  roundDurationMs: 15000,
  roundCount: 10,
};

export const TIER_EMOJI = ["⬛", "🟧", "🟨", "🟩", "🟦"] as const;

export function dailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(date: Date): string {
  return `daily:${dailyKey(date)}`;
}

export function tierOf(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points >= 1000) return 4;
  if (points >= 700) return 3;
  if (points >= 400) return 2;
  if (points >= 150) return 1;
  return 0;
}

export function shareText(input: {
  date: Date;
  total: number;
  points: readonly number[];
  url: string;
}): string {
  const max = input.points.length * 1000;
  // toLocaleString("fr-FR") insère U+202F ou U+00A0 comme séparateur de milliers ;
  // on le normalise en espace ordinaire pour rendre le test stable entre versions de Node.
  const format = (value: number) => value.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
  return [
    `Pokémon Find — ${dailyKey(input.date)}`,
    `${format(input.total)} / ${format(max)}`,
    input.points.map((p) => TIER_EMOJI[tierOf(p)]).join(""),
    input.url,
  ].join("\n");
}
