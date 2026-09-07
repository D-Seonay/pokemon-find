import { type Pool, gapBetween, pokemonById, tryPokemonById } from "@pkfind/shared";
import { useEffect, useRef } from "react";
import { formatPokedexNumber } from "../format.js";
import type { SoloRound } from "../game/useSoloGame.js";
import { PokemonSprite } from "./PokemonSprite.js";

export function RoundResult({
  round,
  pool,
  onSkip,
}: {
  round: SoloRound;
  pool: Pool;
  onSkip?: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  // Le champ de réponse disparaît avec la manche (voir PokemonCombobox, qui se focalise
  // lui-même dès qu'il redevient disponible) : sans ce transfert, le focus retomberait sur
  // <body> et un joueur au clavier devrait tabuler à l'aveugle pour retrouver le seul
  // élément actionnable de cet écran, ce panneau. L'effet se rejoue à chaque manche car ce
  // composant est démonté puis remonté à chaque révélation (voir SoloGame/Daily, qui
  // alternent entre lui et PokemonCombobox selon la phase).
  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  const target = pokemonById(round.targetId);
  const answer = round.answerId === null ? null : tryPokemonById(round.answerId);
  const gap = round.answerId === null ? null : gapBetween(round.targetId, round.answerId);

  // Le sens de l'erreur : avec l'écart seul, on ne sait pas de quel côté de la cible on
  // est tombé. C'est ce qui rend la manche instructive plutôt que juste sanctionnée.
  const direction =
    round.answerId === null || round.answerId === round.targetId
      ? ""
      : round.answerId < round.targetId
        ? ", trop bas"
        : ", trop haut";

  return (
    <section
      ref={sectionRef}
      role="button"
      tabIndex={0}
      aria-live="polite"
      onClick={onSkip}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSkip?.();
      }}
      className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center"
    >
      <PokemonSprite pokemon={target} size={160} />
      <p className="text-2xl font-extrabold">{target.nameFr}</p>
      <p className="mono text-[var(--text-dim)]">{formatPokedexNumber(target.id, pool.maxId)}</p>
      <p>
        {answer
          ? `Votre réponse : ${answer.nameFr} ${formatPokedexNumber(answer.id, pool.maxId)} — écart ${gap}${direction}`
          : "Pas de réponse — temps écoulé"}
      </p>
      <p className="mono text-4xl" style={{ color: "var(--accent)" }}>
        +{round.points}
      </p>
      {onSkip && <p className="text-sm text-[var(--text-dim)]">Clic ou Entrée pour continuer</p>}
    </section>
  );
}
