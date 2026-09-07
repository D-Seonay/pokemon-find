import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MIN_GENERATION_SAMPLE,
  computeStats,
  generationBreakdown,
  readSoloHistory,
} from "../storage/stats.js";

function formatGap(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function Stats() {
  // Lu une seule fois au montage : rien ici n'écrit dans le stockage, mais l'initialiseur
  // paresseux garde la lecture hors du corps du composant, où elle serait rejouée à chaque
  // rendu sans raison.
  const [history] = useState(() => readSoloHistory());

  const stats = useMemo(() => computeStats(history), [history]);
  const rows = useMemo(() => generationBreakdown(history), [history]);

  if (history.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold">Statistiques</h1>
        <p className="text-[var(--text-dim)]">
          Aucune partie solo terminée pour l'instant. Vos écarts et vos réponses exactes
          s'accumuleront ici au fil des parties.
        </p>
        <Link to="/solo" className="underline">
          Jouer une partie
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Statistiques</h1>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-[var(--text-dim)]">Parties</dt>
          <dd className="mono text-2xl">{history.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-dim)]">Manches répondues</dt>
          <dd className="mono text-2xl">{stats.roundsPlayed}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-dim)]">Écart moyen</dt>
          <dd className="mono text-2xl">
            {stats.averageGap === null ? "—" : formatGap(stats.averageGap)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-dim)]">Réponses exactes</dt>
          <dd className="mono text-2xl">{stats.exactHits}</dd>
        </div>
      </dl>

      {stats.weakestGeneration !== null && (
        <p>
          Génération à travailler :{" "}
          <strong className="mono">Génération {stats.weakestGeneration}</strong>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Écart moyen par génération</caption>
          <thead className="text-[var(--text-dim)]">
            <tr>
              <th scope="col">Génération</th>
              <th scope="col">Manches</th>
              <th scope="col">Écart moyen</th>
            </tr>
          </thead>
          <tbody className="mono">
            {rows.map((row) => (
              <tr key={row.generation}>
                <th scope="row" className="font-normal">
                  Génération {row.generation}
                </th>
                <td>{row.roundsPlayed}</td>
                <td>
                  {formatGap(row.averageGap)}
                  {!row.significant && (
                    <span className="ml-2 text-[var(--text-dim)]">
                      (moins de {MIN_GENERATION_SAMPLE} manches)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-[var(--text-dim)]">
        Une génération n'est désignée comme la plus faible qu'à partir de {MIN_GENERATION_SAMPLE}{" "}
        manches jouées : en dessous, l'écart ne prouve rien.
      </p>

      <Link to="/" className="underline">
        Retour à l'accueil
      </Link>
    </section>
  );
}
