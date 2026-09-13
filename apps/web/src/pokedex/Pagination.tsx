import { PAGE_SIZE } from "./paginate.js";

export function Pagination({
  page,
  total,
  onChange,
  label = "Pagination",
}: {
  page: number;
  total: number;
  onChange: (next: number) => void;
  /**
   * La barre est rendue deux fois, en tête et en pied de liste. Deux repères de
   * navigation au même nom s'annoncent à l'identique dans un lecteur d'écran, sans moyen
   * de les distinguer : chacun porte donc son propre libellé.
   */
  label?: string;
}) {
  const last = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  // Rien à parcourir : la barre disparaît plutôt que d'afficher « Page 1 sur 1 » avec
  // deux boutons inertes.
  if (last === 0) return null;

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label="Page précédente"
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        ← Précédent
      </button>
      {/* `aria-live` : le changement de page ne déplace pas le focus, un lecteur d'écran
          n'aurait donc aucun moyen de savoir que la liste a changé. */}
      <p aria-live="polite" className="mono text-sm text-[var(--text-dim)]">
        Page {page + 1} sur {last + 1}
      </p>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === last}
        aria-label="Page suivante"
        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Suivant →
      </button>
    </nav>
  );
}
