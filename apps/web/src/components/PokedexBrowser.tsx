import {
  ALL_GENERATIONS,
  type GenerationId,
  type Pokemon,
  buildPool,
  pokemonOfPool,
  searchPokemon,
} from "@pkfind/shared";
import { useEffect, useMemo, useState } from "react";
import { type DetailMap, loadDetails } from "../pokedex/details.js";
import { PokedexCard } from "../pokedex/PokedexCard.js";
import { Pagination } from "../pokedex/Pagination.js";
import { pageSlice } from "../pokedex/paginate.js";
import { PokemonDialog } from "../pokedex/PokemonDialog.js";
import { GenerationPicker } from "./GenerationPicker.js";

/**
 * La liste consultable des Pokémon : recherche, filtre par génération, grille de fiches.
 * Partagée entre la page `/pokedex` et le lobby multijoueur, où elle s'ouvre sans quitter
 * la room.
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
  const [details, setDetails] = useState<DetailMap>({});
  const [open, setOpen] = useState<Pokemon | null>(null);
  const [page, setPage] = useState(0);

  // Chargées à l'ouverture du Pokédex, pas au démarrage du jeu : 70 Ko compressés que
  // seuls paient ceux qui consultent la liste (voir pokedex/details.ts). Un échec n'est
  // pas fatal — la grille reste utilisable, sans pastilles de types ni fiche détaillée.
  useEffect(() => {
    let alive = true;
    loadDetails()
      .then((loaded) => {
        if (alive) setDetails(loaded);
      })
      .catch(() => {
        /* table vide : l'écran fonctionne en mode dégradé. */
      });
    return () => {
      alive = false;
    };
  }, []);

  const pool = useMemo(() => buildPool(generations), [generations]);

  // `searchPokemon` plafonne à 8 résultats par défaut, ce qui sert l'autocomplétion du
  // jeu mais pas une liste consultable : on lui demande ici tout le pool.
  const entries = useMemo(
    () => (query.trim() === "" ? pokemonOfPool(pool) : searchPokemon(query, pool, pool.ids.length)),
    [pool, query],
  );

  // Retour en première page dès que la liste change de contenu. Sans ça, filtrer depuis
  // la page 3 laisserait sur une page qui n'existe plus pour le nouveau filtre : l'écran
  // paraîtrait vide alors qu'il y a des résultats.
  const signature = `${query}|${generations.join(",")}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setPage(0);
  }

  const shown = pageSlice(entries, page);

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
        <>
          <Pagination page={page} total={entries.length} onChange={setPage} />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((pokemon) => (
              <li key={pokemon.id} className="contents">
                <PokedexCard
                  pokemon={pokemon}
                  detail={details[String(pokemon.id)]}
                  maxId={pool.maxId}
                  onOpen={() => setOpen(pokemon)}
                />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            total={entries.length}
            onChange={setPage}
            label="Pagination, en bas de la liste"
          />
        </>
      )}

      {open && (
        <PokemonDialog
          pokemon={open}
          detail={details[String(open.id)]}
          maxId={pool.maxId}
          onClose={() => setOpen(null)}
          // Sauter à une évolution remplace la fiche au lieu d'en empiler une seconde :
          // on parcourt une famille sans jamais perdre le chemin du retour.
          onSelect={setOpen}
        />
      )}
    </div>
  );
}
