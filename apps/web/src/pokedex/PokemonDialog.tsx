import type { Pokemon } from "@pkfind/shared";
import { useEffect, useRef } from "react";
import { PokemonSprite } from "../components/PokemonSprite.js";
import { formatPokedexNumber } from "../format.js";
import type { PokemonDetail } from "./details.js";
import { TypeBadge } from "./TypeBadge.js";

const STAT_LABELS: readonly [keyof PokemonDetail["stats"], string][] = [
  ["hp", "PV"],
  ["atk", "Attaque"],
  ["def", "Défense"],
  ["spa", "Atq. Spé."],
  ["spd", "Déf. Spé."],
  ["spe", "Vitesse"],
];

// Borne d'affichage des barres. 255 est le maximum théorique d'une statistique de base ;
// s'en servir écraserait toutes les barres, la quasi-totalité des valeurs vivant sous 150.
const STAT_SCALE = 180;

export function PokemonDialog({
  pokemon,
  detail,
  maxId,
  onClose,
}: {
  pokemon: Pokemon;
  detail: PokemonDetail | undefined;
  maxId: number;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Le focus entre dans le dialogue à l'ouverture, sinon il resterait sur la carte
  // désormais masquée par la surcouche — et la tabulation repartirait du haut de la page.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      // Le clic sur le fond ferme, comme la touche Échap : deux sorties évidentes valent
      // mieux qu'un seul bouton à trouver.
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-titre"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono text-sm text-[var(--text-dim)]">
              {formatPokedexNumber(pokemon.id, maxId)}
            </p>
            <h2 id="fiche-titre" className="text-2xl font-extrabold">
              {pokemon.nameFr}
            </h2>
            <p className="text-sm text-[var(--text-dim)]">{pokemon.nameEn}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1 text-sm"
          >
            Fermer
          </button>
        </div>

        <div className="flex items-center gap-4">
          <PokemonSprite pokemon={pokemon} size={120} />
          <div className="flex flex-col gap-2">
            {detail && (
              <span className="flex flex-wrap gap-1">
                {detail.types.map((type) => (
                  <TypeBadge key={type} type={type} size="md" />
                ))}
              </span>
            )}
            {detail?.genus && <p className="text-sm text-[var(--text-dim)]">{detail.genus}</p>}
            <p className="mono text-sm">Génération {pokemon.generation}</p>
          </div>
        </div>

        {detail ? (
          <>
            {detail.flavor && <p className="text-sm leading-relaxed">{detail.flavor}</p>}

            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-[var(--text-dim)]">Taille</dt>
                <dd className="mono">{detail.heightM.toFixed(1).replace(".", ",")} m</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-dim)]">Poids</dt>
                <dd className="mono">{detail.weightKg.toFixed(1).replace(".", ",")} kg</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-1">
              <p className="text-xs text-[var(--text-dim)]">Statistiques de base</p>
              {STAT_LABELS.map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-[var(--text-dim)]">{label}</span>
                  <span className="mono w-8 shrink-0 text-right text-sm">{detail.stats[key]}</span>
                  <span
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (detail.stats[key] / STAT_SCALE) * 100)}%`,
                        background: "var(--accent-2)",
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p role="status" className="text-sm text-[var(--text-dim)]">
            Fiche détaillée indisponible — le reste du Pokédex fonctionne quand même.
          </p>
        )}
      </div>
    </div>
  );
}
