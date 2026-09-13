import {
  ROUND_COUNTS,
  ROUND_DURATIONS,
  type RoundCount,
  type RoundDurationMs,
} from "@pkfind/shared";
import { useId } from "react";

/**
 * Le temps par manche et le nombre de manches, partagés par la configuration solo et le
 * lobby multijoueur — même rôle que `GenerationPicker` pour les générations. Purement
 * présentationnel : c'est à l'appelant de décider si le changement part sur le réseau
 * (multi, avec état optimiste) ou reste local (solo).
 */
export function RoundTimingPicker({
  durationMs,
  roundCount,
  onDurationChange,
  onCountChange,
}: {
  durationMs: RoundDurationMs;
  roundCount: RoundCount;
  onDurationChange: (value: RoundDurationMs) => void;
  onCountChange: (value: RoundCount) => void;
}) {
  // Deux instances ne coexistent sur aucun écran aujourd'hui, mais des noms de groupe
  // fixes les feraient fusionner en un seul jeu de boutons radio si cela changeait.
  const durationGroup = useId();
  const countGroup = useId();

  return (
    <>
      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Temps par manche</legend>
        <div className="flex gap-4">
          {ROUND_DURATIONS.map((duration) => (
            <label key={duration} className="flex items-center gap-2">
              <input
                type="radio"
                name={durationGroup}
                aria-label={`${duration / 1000} s`}
                checked={durationMs === duration}
                onChange={() => onDurationChange(duration)}
              />
              <span className="mono">{duration / 1000} s</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Nombre de manches</legend>
        <div className="flex gap-4">
          {ROUND_COUNTS.map((count) => (
            <label key={count} className="flex items-center gap-2">
              <input
                type="radio"
                name={countGroup}
                aria-label={`${count} manches`}
                checked={roundCount === count}
                onChange={() => onCountChange(count)}
              />
              <span className="mono">{count}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
