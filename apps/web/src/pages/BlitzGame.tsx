import { type BlitzSettings, DEFAULT_BLITZ_SETTINGS } from "@pkfind/shared";
import { useLocation, useNavigate } from "react-router-dom";
import { BlitzGrid } from "../blitz/BlitzGrid.js";
import { BlitzInput } from "../blitz/BlitzInput.js";
import { Button } from "../components/Button.js";
import { useBlitzGame } from "../game/useBlitzGame.js";
import { formatBlitzDuration } from "./BlitzSetup.js";

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function BlitzGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = (location.state as BlitzSettings | null) ?? DEFAULT_BLITZ_SETTINGS;
  const game = useBlitzGame(settings);

  const total = game.pool.ids.length;

  if (game.phase === "finished") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold">Temps écoulé</h1>
        <p className="mono text-5xl" style={{ color: "var(--accent)" }}>
          {game.found.length} / {total}
        </p>
        <p className="text-[var(--text-dim)]">
          {game.found.length === total
            ? "Pokédex complet, et avant la fin du temps."
            : `Il en manquait ${total - game.found.length}. Les voici, en retrait.`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => navigate("/blitz")}>Rejouer</Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Accueil
          </Button>
        </div>
        <BlitzGrid pool={game.pool} found={game.found} revealMissing />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <p className="mono text-2xl" aria-label={`Temps restant ${formatClock(game.remainingMs)}`}>
          {formatClock(game.remainingMs)}
        </p>
        <p className="mono text-[var(--text-dim)]">
          {game.found.length} / {total}
        </p>
      </header>

      <BlitzInput
        value={game.entry}
        onChange={game.submit}
        foundCount={game.found.length}
        total={total}
      />

      <Button variant="ghost" onClick={game.stop}>
        Terminer maintenant
      </Button>

      <p className="text-sm text-[var(--text-dim)]">
        {formatBlitzDuration(settings.durationMs)} pour retrouver {total} Pokémon.
      </p>

      <BlitzGrid pool={game.pool} found={game.found} />
    </section>
  );
}
