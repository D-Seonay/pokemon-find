import { type Pokemon, type RoundResult, tryPokemonById } from "@pkfind/shared";
import { useEffect, useRef } from "react";
import { formatPokedexNumber } from "../format.js";
import { PokemonSprite } from "./PokemonSprite.js";

export function MultiReveal({
  target,
  results,
  maxId,
}: {
  target: Pokemon;
  results: RoundResult[];
  maxId: number;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  // Contrairement à RoundResult, cette révélation n'est pas actionnable : elle avance sur
  // le calendrier du serveur, il n'y a rien à valider au clavier. On y déplace quand même le
  // focus (tabIndex=-1 : jamais atteint par Tab, seulement par ce focus() programmatique)
  // pour que le round précédent — dont PokemonCombobox vient de disparaître avec la manche —
  // ne laisse pas le focus retomber sur <body>, ce qui rendrait la prochaine tabulation
  // imprévisible. `aria-live` reste la voie d'annonce pour les lecteurs d'écran ; ce transfert
  // de focus ne duplique pas cette annonce, voir la note dans RoundResult.tsx pour le détail.
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-live="polite"
      className="flex flex-col items-center gap-4"
    >
      <PokemonSprite pokemon={target} size={140} />
      <p className="text-2xl font-extrabold">{target.nameFr}</p>
      <p className="mono text-[var(--text-dim)]">{formatPokedexNumber(target.id, maxId)}</p>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--text-dim)]">
            <tr>
              <th scope="col">Joueur</th>
              <th scope="col">Réponse</th>
              <th scope="col">Écart</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody className="mono">
            {results.map((result) => {
              const answer = result.pokemonId === null ? null : tryPokemonById(result.pokemonId);
              // Une réponse exacte (écart 0) correspond forcément au Pokémon cible déjà
              // affiché au-dessus : répéter son nom ici créerait un texte dupliqué sans
              // apporter d'information, on affiche donc une confirmation à la place.
              const isExact = result.gap === 0;
              return (
                <tr key={result.playerId}>
                  <td>{result.nickname}</td>
                  <td>
                    {answer == null ? (
                      "—"
                    ) : isExact ? (
                      "Trouvé !"
                    ) : (
                      <>
                        <span>{answer.nameFr}</span>{" "}
                        <span className="text-[var(--text-dim)]">
                          {formatPokedexNumber(answer.id, maxId)}
                        </span>
                      </>
                    )}
                  </td>
                  <td>{result.gap ?? "—"}</td>
                  <td>{result.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
