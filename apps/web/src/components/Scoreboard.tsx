import type { Standing } from "@pkfind/shared";

export function Scoreboard({
  standings,
  highlightPlayerId,
}: {
  standings: Standing[];
  highlightPlayerId?: string;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left">
        <thead className="text-sm text-[var(--text-dim)]">
          <tr>
            <th scope="col">Rang</th>
            <th scope="col">Joueur</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody className="mono">
          {standings.map((standing) => (
            <tr
              key={standing.playerId}
              data-self={standing.playerId === highlightPlayerId ? "true" : undefined}
              className={standing.playerId === highlightPlayerId ? "text-[var(--accent)]" : ""}
            >
              <td>{standing.rank}</td>
              <td>{standing.nickname}</td>
              <td>{standing.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
