import { type Pokemon, tryPokemonById } from "@pkfind/shared";
import { useState } from "react";
import { PokemonSprite } from "../components/PokemonSprite.js";
import { formatPokedexNumber } from "../format.js";
import type { PokemonDetail } from "./details.js";
import { auraOfType, colorOfType, gradientOfType, labelOfType, primaryType } from "./types.js";

const STAT_ROWS: readonly [keyof PokemonDetail["stats"], string][] = [
  ["hp", "PV"],
  ["atk", "Attaque"],
  ["def", "Défense"],
  ["spa", "Atq. Spé."],
  ["spd", "Déf. Spé."],
  ["spe", "Vitesse"],
];

// Borne d'affichage des barres. 255 est le maximum théorique d'une statistique de base,
// mais s'en servir écraserait toutes les barres : la quasi-totalité des valeurs vit
// sous 150, et l'écran doit rendre les écarts lisibles, pas respecter une échelle absolue.
const STAT_SCALE = 180;

type Tab = "about" | "evolution";

export function PokemonDetailView({
  pokemon,
  detail,
  maxId,
  onSelect,
}: {
  pokemon: Pokemon;
  detail: PokemonDetail | undefined;
  maxId: number;
  /** Naviguer vers un autre Pokémon depuis la chaîne d'évolution. */
  onSelect?: (next: Pokemon) => void;
}) {
  const [tab, setTab] = useState<Tab>("about");
  const accent = primaryType(detail?.types ?? []);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* L'aura teintée du type, derrière le sprite : c'est elle qui donne son identité
          à la fiche, chaque Pokémon colorant son propre écran. */}
      <div
        className="flex w-full items-center justify-center rounded-[var(--radius)] py-6"
        style={{ background: detail ? auraOfType(accent) : "transparent" }}
      >
        <PokemonSprite pokemon={pokemon} size={168} />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <h2 className="text-3xl font-extrabold">{pokemon.nameFr}</h2>
        <p className="text-[var(--text-dim)]">{pokemon.nameEn}</p>
        {detail && (
          <p className="text-lg text-[var(--text-dim)]">
            {detail.types.map((t) => labelOfType(t)).join(" / ")}
          </p>
        )}
      </div>

      {detail ? (
        <>
          <div role="tablist" aria-label="Sections de la fiche" className="flex gap-2">
            {(
              [
                ["about", "À propos"],
                ["evolution", "Évolutions"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className="rounded-full border px-4 py-1.5 text-sm font-semibold"
                style={
                  tab === id
                    ? { borderColor: colorOfType(accent), color: "var(--text)" }
                    : { borderColor: "var(--border)", color: "var(--text-dim)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "about" ? (
            <div className="flex w-full flex-col gap-4">
              {detail.flavor && <p className="text-sm leading-relaxed">{detail.flavor}</p>}

              <dl className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <dt className="text-xs text-[var(--text-dim)]">Taille</dt>
                  <dd className="mono">{detail.heightM.toFixed(1).replace(".", ",")} m</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-dim)]">Poids</dt>
                  <dd className="mono">{detail.weightKg.toFixed(1).replace(".", ",")} kg</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-dim)]">Génération</dt>
                  <dd className="mono">{pokemon.generation}</dd>
                </div>
              </dl>

              {detail.genus && (
                <p className="text-center text-sm text-[var(--text-dim)]">{detail.genus}</p>
              )}

              <div className="flex flex-col gap-2">
                {STAT_ROWS.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm text-[var(--text-dim)]">{label}</span>
                    <span className="mono w-9 shrink-0 text-right font-semibold">
                      {detail.stats[key]}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-2.5 flex-1 overflow-hidden rounded-full"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (detail.stats[key] / STAT_SCALE) * 100)}%`,
                          background: gradientOfType(accent),
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EvolutionChain
              stages={detail.evolution}
              currentId={pokemon.id}
              maxId={maxId}
              {...(onSelect ? { onSelect } : {})}
            />
          )}
        </>
      ) : (
        <p role="status" className="text-sm text-[var(--text-dim)]">
          Fiche détaillée indisponible — le reste du Pokédex fonctionne quand même.
        </p>
      )}
    </div>
  );
}

function EvolutionChain({
  stages,
  currentId,
  maxId,
  onSelect,
}: {
  stages: number[][];
  currentId: number;
  maxId: number;
  onSelect?: (next: Pokemon) => void;
}) {
  if (stages.length <= 1) {
    return <p className="text-sm text-[var(--text-dim)]">Ce Pokémon n&apos;évolue pas.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {stages.map((stage, index) => (
        <div key={index} className="flex flex-wrap justify-center gap-2">
          {stage.map((id) => {
            const mon = tryPokemonById(id);
            if (!mon) return null;
            const current = id === currentId;
            const content = (
              <>
                <PokemonSprite pokemon={mon} size={56} />
                <span className="mono text-xs text-[var(--text-dim)]">
                  {formatPokedexNumber(mon.id, maxId)}
                </span>
                <span className="text-xs">{mon.nameFr}</span>
              </>
            );
            // Le Pokémon affiché n'est pas cliquable : rien à aller voir, on y est déjà.
            return current || !onSelect ? (
              <span
                key={id}
                aria-current={current ? "true" : undefined}
                className="flex w-24 flex-col items-center rounded-[var(--radius-sm)] border p-2 text-center"
                style={{ borderColor: current ? "var(--accent)" : "transparent" }}
              >
                {content}
              </span>
            ) : (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(mon)}
                aria-label={`${mon.nameFr}, voir la fiche`}
                className="flex w-24 flex-col items-center rounded-[var(--radius-sm)] border border-transparent p-2 text-center hover:border-[var(--border)]"
              >
                {content}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
