/**
 * La logique de pagination, dans un fichier nommé `paginate` et non `pagination` : ce
 * dernier ne différerait du composant `Pagination.tsx` que par la casse, donc
 * désignerait le MÊME fichier sur macOS et Windows — le composant finissait par
 * s'importer lui-même.
 *
 * Nombre de fiches par page. Multiple de 2 et de 3, les deux largeurs de grille, pour
 * qu'une page pleine ne laisse jamais de rangée incomplète.
 */
export const PAGE_SIZE = 48;

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/**
 * La tranche affichée. `page` est bornée plutôt que supposée valide : un filtre qui
 * rétrécit la liste peut rendre la page courante inexistante, et l'écran doit alors
 * montrer la dernière page réelle, pas du vide.
 */
export function pageSlice<T>(items: readonly T[], page: number): T[] {
  const last = pageCount(items.length) - 1;
  const safe = Math.min(Math.max(0, page), last);
  return items.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE);
}
