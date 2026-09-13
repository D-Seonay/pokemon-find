import { useEffect, useRef } from "react";

/**
 * Le champ de saisie du mode « contre la montre », partagé par le solo et le multijoueur.
 *
 * Un champ libre, sans autocomplétion : suggérer les noms donnerait les réponses, ce qui
 * est précisément ce qu'on demande au joueur de retrouver. Le focus est pris au montage —
 * dans un jeu chronométré, demander un clic avant de pouvoir taper coûte des secondes.
 *
 * Le compteur visible est l'affaire de l'écran ; la région `aria-live` ci-dessous existe
 * pour un lecteur d'écran, qui ne verrait sinon rien se passer quand une case se remplit.
 */
export function BlitzInput({
  value,
  onChange,
  foundCount,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  foundCount: number;
  total: number;
}) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <>
      <input
        ref={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Nommer un Pokémon"
        placeholder="Tapez un nom…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]"
      />
      <p aria-live="polite" className="sr-only">
        {foundCount} Pokémon trouvés sur {total}
      </p>
    </>
  );
}
