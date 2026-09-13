import { type BlitzSettings, DEFAULT_BLITZ_SETTINGS } from "@pkfind/shared";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BlitzGrid } from "../blitz/BlitzGrid.js";
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
  const field = useRef<HTMLInputElement>(null);

  // Le champ prend le focus au démarrage : dans un jeu chronométré, demander un clic
  // avant de pouvoir taper coûte des secondes au joueur.
  useEffect(() => {
    field.current?.focus();
  }, []);

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

      {/* Un champ libre, sans autocomplétion : suggérer les noms donnerait les réponses,
          ce qui est précisément ce qu'on demande au joueur de retrouver. */}
      <input
        ref={field}
        value={game.entry}
        onChange={(event) => game.submit(event.target.value)}
        aria-label="Nommer un Pokémon"
        placeholder="Tapez un nom…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]"
      />

      {/* Le compteur est déjà affiché ; cette région ne sert qu'à annoncer les trouvailles
          à un lecteur d'écran, qui ne verrait sinon rien se passer. */}
      <p aria-live="polite" className="sr-only">
        {game.found.length} Pokémon trouvés sur {total}
      </p>

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
