import {
  type GameSettings,
  MAX_SCORE,
  gapBetween,
  pokemonById,
  tryPokemonById,
} from "@pkfind/shared";
import { useEffect, useState } from "react";
import type { SoloRound } from "../game/useSoloGame.js";
import { readBest, saveBest } from "../storage/scores.js";
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

  // Lu une seule fois, via l'état initial paresseux de useState : cette valeur est capturée
  // avant que quoi que ce soit n'écrive dans le stockage. En StrictMode, React double-invoque
  // le rendu en développement ; si on lisait `readBest` directement dans le corps du composant
  // après un `saveBest` déclenché au premier rendu, le second rendu verrait déjà le score du
  // jour enregistré et casserait le calcul du record. L'initialiseur paresseux ne s'exécute
  // qu'au montage, jamais sur les rendus suivants.
  const [previousBest] = useState<number | null>(() => readBest(settings)?.score ?? null);
  const isRecord = previousBest === null || total > previousBest;

  useEffect(() => {
    // L'écriture est un effet de bord : elle doit avoir lieu après le rendu, pas pendant.
    // `saveBest` est idempotent pour un même score (elle n'écrase que sur un score strictement
    // supérieur), donc un second passage de cet effet en StrictMode est sans conséquence.
    saveBest(settings, total);
  }, [settings, total]);

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
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--text-dim)]">
            <tr>
              <th scope="col">Cible</th>
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
                  <td>#{round.targetId}</td>
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
