import { UNLIMITED_ROUND_MS } from "@pkfind/shared";
/**
 * Numéro national tel qu'on l'affiche : préfixé de « # » et complété de zéros sur la
 * largeur du pool courant — 3 chiffres tant qu'il tient sous 1000, 4 au-delà. Le
 * remplissage dépend du pool et non du numéro, pour que deux numéros affichés côte à
 * côte s'alignent (la cible et la réponse du joueur, par exemple).
 */
export function formatPokedexNumber(id: number, maxId: number): string {
  return `#${String(id).padStart(maxId > 999 ? 4 : 3, "0")}`;
}

/**
 * Le libellé d'une durée de manche. Les trois valeurs courtes gardent leur forme en
 * secondes ; la minute et l'absence de limite ne se lisent pas bien ainsi (« 60 s »,
 * « 0 s » — ce dernier voulant dire l'inverse de ce qu'il montre).
 */
export function formatRoundDuration(ms: number): string {
  if (ms === UNLIMITED_ROUND_MS) return "Sans limite";
  if (ms === 60000) return "1 min";
  return `${ms / 1000} s`;
}
