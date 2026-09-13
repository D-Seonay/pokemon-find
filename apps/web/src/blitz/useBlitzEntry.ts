import { matchPokemonName, type Pokemon, type Pool } from "@pkfind/shared";
import { useCallback, useRef, useState } from "react";

/**
 * La saisie « contre la montre » : ce que le joueur tape, et le moment exact où ça compte.
 * Partagé par le solo (`useBlitzGame`) et le multijoueur (`Room`), pour que les deux
 * valident au même instant, sur la même règle — un nom complet, français ou anglais.
 *
 * Le champ se vide dès qu'un Pokémon du pool est reconnu, y compris s'il était déjà
 * trouvé : le dédoublonnage appartient à l'appelant, mais laisser la saisie en place
 * ferait croire au joueur que sa frappe n'a pas été prise en compte.
 */
export function useBlitzEntry(
  pool: Pool,
  onFound: (pokemon: Pokemon) => void,
  active: boolean,
): { entry: string; submit: (value: string) => void } {
  const [entry, setEntry] = useState("");

  // Le rappel change d'identité à chaque rendu de l'appelant ; le garder dans une ref
  // évite d'en faire une dépendance qui recréerait `submit` sans arrêt.
  const found = useRef(onFound);
  found.current = onFound;

  const submit = useCallback(
    (value: string) => {
      setEntry(value);
      if (!active) return;
      const match = matchPokemonName(value, pool);
      if (!match) return;
      found.current(match);
      setEntry("");
    },
    [active, pool],
  );

  return { entry, submit };
}
