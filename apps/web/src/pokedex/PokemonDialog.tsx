import type { Pokemon } from "@pkfind/shared";
import { useEffect, useRef } from "react";
import type { PokemonDetail } from "./details.js";
import { PokemonDetailView } from "./PokemonDetailView.js";

/**
 * La fiche en surcouche, pour les contextes qu'on ne peut pas quitter — le lobby
 * multijoueur, où naviguer ferait sortir de la room. La page `/pokedex/:id` affiche la
 * même fiche en plein écran.
 */
export function PokemonDialog({
  pokemon,
  detail,
  maxId,
  onClose,
  onSelect,
}: {
  pokemon: Pokemon;
  detail: PokemonDetail | undefined;
  maxId: number;
  onClose: () => void;
  onSelect?: (next: Pokemon) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Le focus entre dans le dialogue à l'ouverture. Ce n'est pas que du confort : le
  // gestionnaire d'Échap est posé sur la surcouche et ne reçoit l'événement que parce que
  // le focus est à l'intérieur — sans ce transfert, la fermeture au clavier ne marche pas.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      // Le clic sur le fond ferme, comme Échap : deux sorties évidentes valent mieux
      // qu'un seul bouton à trouver.
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 p-4 sm:items-center"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-titre"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="my-auto flex w-full max-w-[480px] flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-5"
      >
        <div className="flex items-center justify-between">
          <span className="mono text-sm text-[var(--text-dim)]">Fiche</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1 text-sm"
          >
            Fermer
          </button>
        </div>
        <h3 id="fiche-titre" className="sr-only">
          {pokemon.nameFr}
        </h3>
        <PokemonDetailView
          pokemon={pokemon}
          detail={detail}
          maxId={maxId}
          {...(onSelect ? { onSelect } : {})}
        />
      </div>
    </div>
  );
}
