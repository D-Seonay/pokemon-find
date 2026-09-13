import {
  BLITZ_DURATIONS,
  type BlitzDurationMs,
  type BlitzSettings,
  DEFAULT_BLITZ_SETTINGS,
  buildPool,
} from "@pkfind/shared";
import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";

export function formatBlitzDuration(ms: number): string {
  return ms === 60_000 ? "1 min" : `${ms / 60_000} min`;
}

export function BlitzSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<BlitzSettings>(DEFAULT_BLITZ_SETTINGS);
  const durationGroup = useId();

  const pool = useMemo(() => buildPool(settings.generations), [settings.generations]);

  return (
    <section className="flex flex-col gap-4">
      <BackLink />
      <h1 className="text-3xl font-extrabold">Contre la montre</h1>
      <p className="text-[var(--text-dim)]">
        Nommez le plus de Pokémon possible avant la fin du temps. Les noms français et anglais sont
        acceptés, et se valident tout seuls dès qu'ils sont complets.
      </p>

      <GenerationPicker
        value={settings.generations}
        onChange={(generations) => setSettings({ ...settings, generations })}
      />

      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Durée</legend>
        <div className="flex flex-wrap gap-4">
          {BLITZ_DURATIONS.map((duration) => (
            <label key={duration} className="flex items-center gap-2">
              <input
                type="radio"
                name={durationGroup}
                aria-label={formatBlitzDuration(duration)}
                checked={settings.durationMs === duration}
                onChange={() => setSettings({ ...settings, durationMs: duration })}
              />
              <span className="mono">{formatBlitzDuration(duration)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mono text-sm text-[var(--text-dim)]">
        {pool.ids.length} Pokémon à retrouver en {formatBlitzDuration(settings.durationMs)}.
      </p>

      <Button
        disabled={settings.generations.length === 0}
        onClick={() => navigate("/blitz/play", { state: settings })}
      >
        Lancer
      </Button>
    </section>
  );
}

export type { BlitzDurationMs };
