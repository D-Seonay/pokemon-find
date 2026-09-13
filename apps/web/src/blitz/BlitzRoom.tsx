import type { PlayerPublic, Pokemon, Pool } from "@pkfind/shared";
import { BlitzGrid } from "./BlitzGrid.js";
import { BlitzInput } from "./BlitzInput.js";
import { BlitzLeaderboard } from "./BlitzLeaderboard.js";
import { useBlitzEntry } from "./useBlitzEntry.js";

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Le blitz en room : même saisie et même grille qu'en solo, plus le classement en direct.
 * Chacun joue sa propre liste sur le même pool — un Pokémon trouvé par quelqu'un reste
 * disponible pour les autres, personne n'est bloqué.
 */
export function BlitzRoom({
  pool,
  found,
  endsAt,
  now,
  players,
  playerId,
  onFound,
}: {
  pool: Pool;
  /** La liste de CE joueur, tenue par le serveur qui fait foi. */
  found: readonly number[];
  endsAt: number;
  now: number;
  players: readonly PlayerPublic[];
  playerId?: string;
  onFound: (pokemon: Pokemon) => void;
}) {
  const total = pool.ids.length;
  const { entry, submit } = useBlitzEntry(pool, onFound, true);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <p className="mono text-2xl" aria-label={`Temps restant ${formatClock(endsAt - now)}`}>
          {formatClock(endsAt - now)}
        </p>
        <p className="mono text-[var(--text-dim)]">
          {found.length} / {total}
        </p>
      </header>

      <BlitzInput value={entry} onChange={submit} foundCount={found.length} total={total} />

      <BlitzLeaderboard
        players={players}
        total={total}
        {...(playerId ? { highlightPlayerId: playerId } : {})}
      />

      <BlitzGrid pool={pool} found={found} />
    </section>
  );
}
