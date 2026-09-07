import {
  type GameSettings,
  MAX_SCORE,
  buildPool,
  gapBetween,
  pokemonById,
  tryPokemonById,
} from "@pkfind/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPokedexNumber } from "../format.js";
import type { SoloRound } from "../game/useSoloGame.js";
import { readBest, saveBest } from "../storage/scores.js";
import {
  type SoloHistoryEntry,
  computeStats,
  readSoloHistory,
  recordSoloGame,
  toStatsRounds,
} from "../storage/stats.js";
import { Button } from "./Button.js";

export function GameOver({
  rounds,
  settings,
  onReplay,
}: {
  rounds: SoloRound[];
  settings: GameSettings;
  onReplay: () => void;
}) {
  const total = rounds.reduce((sum, round) => sum + round.points, 0);
  const maxId = useMemo(() => buildPool(settings.generations).maxId, [settings.generations]);

  // Lu une seule fois, via l'état initial paresseux de useState : cette valeur est capturée
  // avant que quoi que ce soit n'écrive dans le stockage. En StrictMode, React double-invoque
  // le rendu en développement ; si on lisait `readBest` directement dans le corps du composant
  // après un `saveBest` déclenché au premier rendu, le second rendu verrait déjà le score du
  // jour enregistré et casserait le calcul du record. L'initialiseur paresseux ne s'exécute
  // qu'au montage, jamais sur les rendus suivants.
  const [previousBest] = useState<number | null>(() => readBest(settings)?.score ?? null);
  const isRecord = previousBest === null || total > previousBest;

  // Même piège, même remède : l'historique d'AVANT cette partie est capturé une seule fois au
  // montage, avant que l'effet ci-dessous n'y ajoute la partie en cours. Les statistiques
  // affichées combinent cet historique figé avec les manches de la partie courante, calculées
  // en mémoire — on n'a donc jamais besoin de relire le stockage après l'écriture, ce qui
  // évite complètement le piège de lecture-après-écriture en StrictMode.
  const [priorHistory] = useState<SoloHistoryEntry[]>(() => readSoloHistory());
  const stats = useMemo(() => {
    const currentEntry: SoloHistoryEntry = { date: "", rounds: toStatsRounds(rounds) };
    return computeStats([...priorHistory, currentEntry]);
  }, [priorHistory, rounds]);

  useEffect(() => {
    // L'écriture est un effet de bord : elle doit avoir lieu après le rendu, pas pendant.
    // `saveBest` est idempotent pour un même score (elle n'écrase que sur un score strictement
    // supérieur), donc un second passage de cet effet en StrictMode est sans conséquence.
    saveBest(settings, total);
  }, [settings, total]);

  // Contrairement à `saveBest`, `recordSoloGame` n'est PAS idempotent : chaque appel AJOUTE
  // une entrée à l'historique. Un second passage de cet effet en StrictMode dupliquerait donc
  // la partie et fausserait toutes les statistiques dérivées. La ref survit au double-passage
  // (React ne la réinitialise pas entre les deux invocations de StrictMode sur la même
  // instance de composant), ce qui garantit un enregistrement unique par partie terminée.
  const recorded = useRef(false);
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordSoloGame(rounds);
  }, [rounds]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Partie terminée</h1>
      <p className="mono text-5xl" style={{ color: "var(--accent)" }}>
        {total} / {rounds.length * MAX_SCORE}
      </p>
      {isRecord ? (
        <p style={{ color: "var(--success)" }}>Nouveau record pour cette configuration.</p>
      ) : (
        previousBest !== null && (
          <p className="text-[var(--text-dim)]">Votre record : {previousBest}</p>
        )
      )}
      {stats.roundsPlayed > 0 && (
        <ul className="text-sm text-[var(--text-dim)]">
          <li>
            Écart moyen :{" "}
            <span className="mono">
              {stats.averageGap?.toLocaleString("fr-FR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
          </li>
          <li>
            Réponses exactes : <span className="mono">{stats.exactHits}</span> /{" "}
            {stats.roundsPlayed}
          </li>
          {stats.weakestGeneration !== null && (
            <li>
              Génération à travailler :{" "}
              <span className="mono">Génération {stats.weakestGeneration}</span>
            </li>
          )}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--text-dim)]">
            <tr>
              <th scope="col" className="hidden sm:table-cell">
                Cible
              </th>
              <th scope="col">Pokémon</th>
              <th scope="col">Réponse</th>
              <th scope="col">Écart</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody className="mono">
            {rounds.map((round, index) => {
              const answer = round.answerId === null ? null : tryPokemonById(round.answerId);
              return (
                <tr key={`${round.targetId}-${index}`}>
                  <td className="hidden sm:table-cell">
                    {formatPokedexNumber(round.targetId, maxId)}
                  </td>
                  <td>{pokemonById(round.targetId).nameFr}</td>
                  <td>{answer?.nameFr ?? "—"}</td>
                  <td>
                    {round.answerId === null ? "—" : gapBetween(round.targetId, round.answerId)}
                  </td>
                  <td>{round.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button onClick={onReplay}>Rejouer</Button>
    </section>
  );
}
