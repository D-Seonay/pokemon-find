import { BLITZ_DURATIONS, type BlitzSettings, type GameMode, GAME_MODES } from "@pkfind/shared";
import { useId } from "react";
import { formatBlitzDuration } from "../pages/BlitzSetup.js";

const MODE_LABELS: Readonly<Record<GameMode, string>> = {
  classic: "Trouver le numéro",
  blitz: "Contre la montre",
};

/**
 * Le choix du jeu, et la durée quand c'est le blitz. Les deux partent dans le même
 * événement : basculer en blitz sans pouvoir régler la durée dans la foulée obligerait
 * l'hôte à deux allers-retours pour une seule décision.
 *
 * Les générations restent le réglage commun aux deux modes, réglé par ailleurs.
 */
export function GameModePicker({
  mode,
  blitz,
  onChange,
}: {
  mode: GameMode;
  blitz: BlitzSettings;
  onChange: (mode: GameMode, blitz: BlitzSettings) => void;
}) {
  const modeGroup = useId();
  const durationGroup = useId();

  return (
    <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
      <legend className="px-2 text-sm text-[var(--text-dim)]">Jeu</legend>
      <div className="flex flex-col gap-2">
        {GAME_MODES.map((candidate) => (
          <label key={candidate} className="flex items-center gap-2">
            <input
              type="radio"
              name={modeGroup}
              aria-label={MODE_LABELS[candidate]}
              checked={mode === candidate}
              onChange={() => onChange(candidate, blitz)}
            />
            <span>{MODE_LABELS[candidate]}</span>
          </label>
        ))}
      </div>

      {mode === "blitz" && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-[var(--border)] pt-3">
          {BLITZ_DURATIONS.map((duration) => (
            <label key={duration} className="flex items-center gap-2">
              <input
                type="radio"
                name={durationGroup}
                aria-label={formatBlitzDuration(duration)}
                checked={blitz.durationMs === duration}
                onChange={() => onChange(mode, { ...blitz, durationMs: duration })}
              />
              <span className="mono">{formatBlitzDuration(duration)}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
