import type { Pokemon } from "@pkfind/shared";
import { PokemonSprite } from "../components/PokemonSprite.js";
import { formatPokedexNumber } from "../format.js";
import type { PokemonDetail } from "./details.js";
import { TypeBadge } from "./TypeBadge.js";

export function PokedexCard({
  pokemon,
  detail,
  maxId,
  onOpen,
}: {
  pokemon: Pokemon;
  /** `undefined` tant que le fichier de détails n'est pas arrivé : la carte reste utile sans. */
  detail: PokemonDetail | undefined;
  maxId: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${pokemon.nameFr}, voir la fiche`}
      className="flex flex-col items-center gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-center transition-colors hover:border-[var(--accent)] focus-visible:border-[var(--accent)]"
    >
      <span className="mono text-xs text-[var(--text-dim)]">
        {formatPokedexNumber(pokemon.id, maxId)}
      </span>
      <PokemonSprite pokemon={pokemon} size={72} />
      <span className="text-sm font-semibold leading-tight">{pokemon.nameFr}</span>
      {/* Le nom anglais reste visible : le jeu accepte les réponses en anglais, et un
          joueur peut très bien connaître « Farfetch'd » sans connaître « Canarticho ». */}
      {pokemon.nameEn !== pokemon.nameFr && (
        <span className="text-xs leading-tight text-[var(--text-dim)]">{pokemon.nameEn}</span>
      )}
      {/* Les pastilles n'apparaissent qu'une fois les détails chargés. La carte ne réserve
          pas leur place : mieux vaut une grille qui se densifie qu'un trou permanent chez
          quelqu'un dont le fichier n'a jamais abouti. */}
      {detail && (
        <span className="flex flex-wrap justify-center gap-1">
          {detail.types.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </span>
      )}
    </button>
  );
}
