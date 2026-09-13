import { type Pool, pokemonOfPool, tryPokemonById } from "@pkfind/shared";
import { useMemo } from "react";
import { PokemonSprite } from "../components/PokemonSprite.js";
import { formatPokedexNumber } from "../format.js";

/**
 * Les cases du pool, dans l'ordre du Pokédex. Toutes présentes dès le départ, vides avec
 * leur numéro : le joueur voit sa collection se remplir et repère d'un coup d'œil ce qui
 * lui manque — c'est ce que la liste des seuls trouvés ne montre pas.
 */
export function BlitzGrid({
  pool,
  found,
  revealMissing = false,
}: {
  pool: Pool;
  found: readonly number[];
  /** En fin de partie : montre les manqués au lieu de laisser des cases vides. */
  revealMissing?: boolean;
}) {
  const foundSet = useMemo(() => new Set(found), [found]);
  const ids = useMemo(() => pokemonOfPool(pool).map((p) => p.id), [pool]);

  return (
    <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {ids.map((id) => {
        const isFound = foundSet.has(id);
        const pokemon = isFound || revealMissing ? tryPokemonById(id) : undefined;
        return (
          <li
            key={id}
            className="flex flex-col items-center gap-0.5 rounded-[var(--radius-sm)] border p-1 text-center"
            style={{
              borderColor: isFound ? "var(--success)" : "var(--border)",
              background: isFound ? "var(--surface)" : "transparent",
              // Les manqués révélés restent en retrait : ils informent sans se confondre
              // avec ce que le joueur a réellement trouvé.
              opacity: isFound ? 1 : revealMissing ? 0.55 : 1,
            }}
          >
            <span className="mono text-[10px] leading-none text-[var(--text-dim)]">
              {formatPokedexNumber(id, pool.maxId)}
            </span>
            {pokemon ? (
              <>
                <PokemonSprite pokemon={pokemon} size={40} />
                <span className="text-[11px] leading-tight">{pokemon.nameFr}</span>
              </>
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 items-center text-lg text-[var(--text-dim)]"
              >
                ?
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
