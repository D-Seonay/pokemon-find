import { type GameSettings, randomSeed, validateSettings } from "@pkfind/shared";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { GameOver } from "../components/GameOver.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { RoundResult } from "../components/RoundResult.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useSoloGame } from "../game/useSoloGame.js";

export function SoloGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const [seed, setSeed] = useState(randomSeed);

  let settings: GameSettings;
  try {
    settings = validateSettings(location.state);
  } catch {
    return <Navigate to="/solo" replace />;
  }

  return (
    // La clé force un démontage/remontage complet à chaque nouvelle graine : `useSoloGame`
    // initialise son état (manche, chrono, historique) avec des `useState` qui ne se
    // réexécutent qu'au montage. Sans cette clé, rejouer changerait bien la graine et donc
    // les cibles tirées, mais la partie resterait bloquée sur l'écran de fin — l'état de la
    // manche précédente ne serait jamais réinitialisé.
    <SoloGameBoard
      key={seed}
      settings={settings}
      seed={seed}
      onReplay={() => setSeed(randomSeed())}
      onQuit={() => navigate("/solo")}
    />
  );
}

function SoloGameBoard({
  settings,
  seed,
  onReplay,
  onQuit,
}: {
  settings: GameSettings;
  seed: string;
  onReplay: () => void;
  onQuit: () => void;
}) {
  const game = useSoloGame(settings, seed);

  if (game.phase === "finished") {
    return (
      <>
        <GameOver rounds={game.rounds} settings={settings} onReplay={onReplay} />
        <button type="button" className="mt-4 underline" onClick={onQuit}>
          Changer les réglages
        </button>
      </>
    );
  }

  const lastRound = game.rounds[game.rounds.length - 1];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <p className="mono text-[var(--text-dim)]">
          Manche {game.roundIndex + 1} / {game.roundCount}
        </p>
        <p className="mono">{game.totalScore} pts</p>
      </header>

      {game.phase === "round" ? (
        <>
          <Timer remainingMs={game.remainingMs} totalMs={settings.roundDurationMs} />
          <TargetNumber id={game.targetId} maxId={game.pool.maxId} />
          <PokemonCombobox pool={game.pool} onSubmit={(pokemon) => game.answer(pokemon.id)} />
        </>
      ) : (
        lastRound && <RoundResult round={lastRound} pool={game.pool} onSkip={game.skipReveal} />
      )}
    </section>
  );
}
