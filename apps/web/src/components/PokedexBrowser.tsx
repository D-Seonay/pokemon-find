import {
  ALL_GENERATIONS,
  type GenerationId,
  buildPool,
  pokemonOfPool,
  searchPokemon,
} from "@pkfind/shared";
import { useMemo, useState } from "react";
import { formatPokedexNumber } from "../format.js";
import { GenerationPicker } from "./GenerationPicker.js";
import { PokemonSprite } from "./PokemonSprite.js";

/**
 * La liste consultable des Pokémon : recherche, filtre par génération, numéros. Partagée
 * entre la page `/pokedex` et le lobby multijoueur, où elle s'ouvre sans quitter la room.
 *
 * `initialGenerations` sert au lobby, qui l'ouvre sur les générations de la partie à
 * venir plutôt que sur les neuf — on révise ce qu'on va jouer.
 */
export function PokedexBrowser({
  initialGenerations = [...ALL_GENERATIONS],
}: {
  initialGenerations?: GenerationId[];
}) {
  const [generations, setGenerations] = useState<GenerationId[]>(initialGenerations);
  const [query, setQuery] = useState("");

  const pool = useMemo(() => buildPool(generations), [generations]);

  // `searchPokemon` plafonne à 8 résultats par défaut, ce qui sert l'autocomplétion du
  // jeu mais pas une liste consultable : on lui demande ici tout le pool.
  const entries = useMemo(
    () => (query.trim() === "" ? pokemonOfPool(pool) : searchPokemon(query, pool, pool.ids.length)),
    [pool, query],
  );

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={query}
        aria-label="Rechercher un Pokémon"
        placeholder="Rechercher (français ou anglais)…"
        onChange={(event) => setQuery(event.target.value)}
        className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]"
      />

      <GenerationPicker value={generations} onChange={setGenerations} />

      <p className="mono text-sm text-[var(--text-dim)]">{entries.length} Pokémon</p>

      {entries.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          Aucun Pokémon ne correspond à cette recherche.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((pokemon) => (
            <li
              key={pokemon.id}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2"
            >
              <PokemonSprite pokemon={pokemon} size={40} />
              <span className="mono text-[var(--text-dim)]">
                {formatPokedexNumber(pokemon.id, pool.maxId)}
              </span>
              <span>{pokemon.nameFr}</span>
              {pokemon.nameEn !== pokemon.nameFr && (
                <span className="text-sm text-[var(--text-dim)]">{pokemon.nameEn}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
