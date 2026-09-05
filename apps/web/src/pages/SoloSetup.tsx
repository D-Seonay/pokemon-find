import {
  DEFAULT_SETTINGS,
  type GameSettings,
  ROUND_COUNTS,
  ROUND_DURATIONS,
  type RoundCount,
  type RoundDurationMs,
} from "@pkfind/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";

export function SoloSetup() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Partie solo</h1>

      <GenerationPicker
        value={settings.generations}
        onChange={(generations) => setSettings({ ...settings, generations })}
      />

      <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <legend className="px-2 text-sm text-[var(--text-dim)]">Temps par manche</legend>
        <div className="flex gap-4">
          {ROUND_DURATIONS.map((duration) => (
            <label key={duration} className="flex items-center gap-2">
              <input
                type="radio"
                name="duration"
                aria-label={`${duration / 1000} s`}
                checked={settings.roundDurationMs === duration}
                onChange={() =>
                  setSettings({ ...settings, roundDurationMs: duration as RoundDurationMs })
                }
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
                name="count"
                aria-label={`${count} manches`}
                checked={settings.roundCount === count}
                onChange={() => setSettings({ ...settings, roundCount: count as RoundCount })}
              />
              <span className="mono">{count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button
        disabled={settings.generations.length === 0}
        onClick={() => navigate("/solo/play", { state: settings })}
      >
        Lancer
      </Button>
    </section>
  );
}
