import { ALL_GENERATIONS, type GenerationId } from "@pkfind/shared";
import { Button } from "./Button.js";

type Props = { value: GenerationId[]; onChange: (next: GenerationId[]) => void };

export function GenerationPicker({ value, onChange }: Props) {
  function toggle(gen: GenerationId): void {
    if (value.includes(gen)) {
      if (value.length === 1) return; // au moins une génération doit rester cochée
      onChange(value.filter((item) => item !== gen));
      return;
    }
    onChange([...value, gen].sort((a, b) => a - b));
  }

  return (
    <fieldset className="rounded-[var(--radius)] border border-[var(--border)] p-4">
      <legend className="px-2 text-sm text-[var(--text-dim)]">Générations</legend>
      <div className="grid grid-cols-3 gap-2">
        {ALL_GENERATIONS.map((gen) => (
          <label
            key={gen}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2"
          >
            <input
              type="checkbox"
              aria-label={`Génération ${gen}`}
              checked={value.includes(gen)}
              onChange={() => toggle(gen)}
            />
            <span className="mono">Gén {gen}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="ghost" onClick={() => onChange([...ALL_GENERATIONS])}>
          Tout sélectionner
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange([1])}>
          Gén 1 seulement
        </Button>
      </div>
    </fieldset>
  );
}
