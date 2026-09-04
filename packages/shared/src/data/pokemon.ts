import type { GenerationId } from "../domain/generations.js";
import type { Pool } from "../domain/pool.js";
import raw from "./pokemon.json" with { type: "json" };

export type Pokemon = {
  id: number;
  nameFr: string;
  nameEn: string;
  slugFr: string;
  slugEn: string;
  generation: GenerationId;
  spriteUrl: string;
};

export const POKEMON: readonly Pokemon[] = raw as Pokemon[];

const BY_ID = new Map<number, Pokemon>(POKEMON.map((p) => [p.id, p]));

export function tryPokemonById(id: number): Pokemon | undefined {
  return BY_ID.get(id);
}

export function pokemonById(id: number): Pokemon {
  const found = BY_ID.get(id);
  if (!found) throw new RangeError(`Pokémon inconnu : ${id}`);
  return found;
}

export function pokemonOfPool(pool: Pool): Pokemon[] {
  return pool.ids.map(pokemonById);
}
