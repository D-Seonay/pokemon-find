import { type Pokemon, pokemonOfPool } from "../data/pokemon.js";
import type { Pool } from "./pool.js";

const DEFAULT_LIMIT = 8;

export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2640/g, "f")
    .replace(/\u2642/g, "m")
    .replace(/[^a-z0-9]/g, "");
}

function rankOf(pokemon: Pokemon, query: string): number {
  if (pokemon.slugFr.startsWith(query)) return 0;
  if (pokemon.slugEn.startsWith(query)) return 1;
  if (pokemon.slugFr.includes(query)) return 2;
  if (pokemon.slugEn.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

export function searchPokemon(query: string, pool: Pool, limit = DEFAULT_LIMIT): Pokemon[] {
  const normalized = normalizeName(query);
  if (normalized.length === 0) return [];
  return pokemonOfPool(pool)
    .map((pokemon) => ({ pokemon, rank: rankOf(pokemon, normalized) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.pokemon.id - b.pokemon.id)
    .slice(0, limit)
    .map((entry) => entry.pokemon);
}
