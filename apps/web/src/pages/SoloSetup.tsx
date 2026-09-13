import { DEFAULT_SETTINGS, type GameSettings } from "@pkfind/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";
import { RoundTimingPicker } from "../components/RoundTimingPicker.js";

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

      <RoundTimingPicker
        durationMs={settings.roundDurationMs}
        roundCount={settings.roundCount}
        onDurationChange={(roundDurationMs) => setSettings({ ...settings, roundDurationMs })}
        onCountChange={(roundCount) => setSettings({ ...settings, roundCount })}
      />

      <Button
        disabled={settings.generations.length === 0}
        onClick={() => navigate("/solo/play", { state: settings })}
      >
        Lancer
      </Button>
    </section>
  );
}
