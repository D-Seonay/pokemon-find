import type { PlayerPublic } from "@pkfind/shared";

/**
 * Le classement en direct : des compteurs, jamais ce que les autres ont trouvé. Montrer
 * leurs Pokémon reviendrait à leur faire souffler les réponses — c'est le même principe
 * que le mode classique, où le numéro circule mais pas le Pokémon.
 */
export function BlitzLeaderboard({
  players,
  total,
  highlightPlayerId,
}: {
  players: readonly PlayerPublic[];
  total: number;
  highlightPlayerId?: string;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((player) => (
        <li
          key={player.id}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1"
          style={{
            background: player.id === highlightPlayerId ? "var(--surface)" : "transparent",
            opacity: player.connected ? 1 : 0.4,
          }}
        >
          <span className="flex-1 truncate text-sm">{player.nickname}</span>
          <span
            aria-hidden="true"
            className="h-2 w-24 overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: total > 0 ? `${Math.min(100, (player.score / total) * 100)}%` : "0%",
                background: "var(--success)",
              }}
            />
          </span>
          <span className="mono w-10 shrink-0 text-right text-sm">{player.score}</span>
        </li>
      ))}
    </ul>
  );
}
