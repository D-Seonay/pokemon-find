import { type Pool, pokemonById, tryPokemonById } from "@pkfind/shared";
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
  const target = pokemonById(round.targetId);
  const answer = round.answerId === null ? null : tryPokemonById(round.answerId);
  const gap = round.answerId === null ? null : Math.abs(round.answerId - round.targetId);

  return (
    <section
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
      <p className="mono text-[var(--text-dim)]">
        #{String(target.id).padStart(pool.maxId > 999 ? 4 : 3, "0")}
      </p>
      <p>
        {answer
          ? `Votre réponse : ${answer.nameFr} — écart ${gap}`
          : "Pas de réponse — temps écoulé"}
      </p>
      <p className="mono text-4xl" style={{ color: "var(--accent)" }}>
        +{round.points}
      </p>
      {onSkip && <p className="text-sm text-[var(--text-dim)]">Clic ou Entrée pour continuer</p>}
    </section>
  );
}
