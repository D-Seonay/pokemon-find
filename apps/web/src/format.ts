/**
 * Numéro national tel qu'on l'affiche : préfixé de « # » et complété de zéros sur la
 * largeur du pool courant — 3 chiffres tant qu'il tient sous 1000, 4 au-delà. Le
 * remplissage dépend du pool et non du numéro, pour que deux numéros affichés côte à
 * côte s'alignent (la cible et la réponse du joueur, par exemple).
 */
export function formatPokedexNumber(id: number, maxId: number): string {
  return `#${String(id).padStart(maxId > 999 ? 4 : 3, "0")}`;
}
