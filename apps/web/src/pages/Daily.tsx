import {
  DAILY_SETTINGS,
  MAX_SCORE,
  TIER_EMOJI,
  dailyKey,
  dailySeed,
  shareText,
  tierOf,
} from "@pkfind/shared";
import { useEffect, useState } from "react";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { RoundResult } from "../components/RoundResult.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { BackLink } from "../components/BackLink.js";
import { CopyButton } from "../components/CopyButton.js";
import { Timer } from "../components/Timer.js";
import { useSoloGame } from "../game/useSoloGame.js";
import { type DailyEntry, currentStreak, readHistory, recordDaily } from "../storage/daily.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function Daily() {
  // Figé une seule fois au montage : la date du jour et la graine du défi doivent provenir
  // du même instant, sinon un franchissement de minuit UTC en cours de partie ferait dériver
  // l'une par rapport à l'autre (voir DailyBoard, qui dérive sa graine de cette même valeur).
  const [now] = useState(() => new Date());
  const today = dailyKey(now);
  const [entry, setEntry] = useState<DailyEntry | null>(() => {
    const stored = readJson<DailyEntry | null>(KEYS.daily, null);
    return stored && stored.date === today ? stored : null;
  });

  if (entry) return <DailyResult entry={entry} today={today} />;
  return <DailyBoard now={now} onFinish={setEntry} today={today} />;
}

function DailyBoard({
  today,
  now,
  onFinish,
}: {
  today: string;
  now: Date;
  onFinish: (entry: DailyEntry) => void;
}) {
  const game = useSoloGame(DAILY_SETTINGS, dailySeed(now));

  useEffect(() => {
    if (game.phase !== "finished") return;
    const result: DailyEntry = {
      date: today,
      total: game.totalScore,
      points: game.rounds.map((round) => round.points),
    };
    writeJson(KEYS.daily, result);
    recordDaily(result);
    onFinish(result);
  }, [game.phase, game.rounds, game.totalScore, onFinish, today]);

  if (game.phase === "finished") return null;

  const lastRound = game.rounds[game.rounds.length - 1];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Défi du jour — {today}</h1>
        <p className="mono">{game.totalScore} pts</p>
      </header>
      <p className="mono text-sm text-[var(--text-dim)]">
        Manche {game.roundIndex + 1} / {game.roundCount} · Pokédex national
      </p>
      {game.phase === "round" ? (
        <>
          <Timer remainingMs={game.remainingMs} totalMs={DAILY_SETTINGS.roundDurationMs} />
          <TargetNumber id={game.targetId} maxId={game.pool.maxId} />
          <PokemonCombobox pool={game.pool} onSubmit={(pokemon) => game.answer(pokemon.id)} />
        </>
      ) : (
        lastRound && <RoundResult round={lastRound} pool={game.pool} onSkip={game.skipReveal} />
      )}
    </section>
  );
}

function DailyResult({ entry, today }: { entry: DailyEntry; today: string }) {
  // Lu une seule fois : l'historique ne bouge plus une fois la partie du jour terminée.
  const [history] = useState(readHistory);
  const streak = currentStreak(history, today);
  const emojis = entry.points.map((points) => TIER_EMOJI[tierOf(points)]).join("");
  const max = entry.points.length * MAX_SCORE;

  // Calculé au rendu plutôt que dans un gestionnaire : `CopyButton` reçoit la valeur et se
  // charge du reste, y compris de dire ce qui s'est passé. L'ancienne version ouvrait un
  // `window.prompt` en cas d'échec — une boîte modale bloquante pour un simple partage.
  const summary = shareText({
    date: new Date(`${entry.date}T12:00:00Z`),
    total: entry.total,
    points: entry.points,
    url: `${window.location.origin}/daily`,
  });

  return (
    <section className="flex flex-col gap-4 text-center">
      <BackLink />
      <h1 className="text-2xl font-extrabold">Défi du jour — {entry.date}</h1>
      <p className="mono text-5xl" style={{ color: "var(--accent)" }}>
        {entry.total.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")}
      </p>
      <p className="text-3xl tracking-widest">{emojis}</p>
      {streak > 0 && (
        <p className="text-[var(--text-dim)]">
          <span className="mono text-[var(--accent)]">{streak}</span>{" "}
          {streak === 1 ? "jour d'affilée" : "jours d'affilée"}
        </p>
      )}
      {history.length > 1 && (
        <ul className="flex flex-wrap justify-center gap-1" aria-label="Trente derniers jours">
          {history.map((day) => (
            <li
              key={day.date}
              title={`${day.date} — ${day.total.toLocaleString("fr-FR")}`}
              className="text-lg leading-none"
            >
              {TIER_EMOJI[tierOf(Math.round(day.total / Math.max(1, day.points.length)))]}
            </li>
          ))}
        </ul>
      )}
      <CopyButton value={summary} label="Partager le résultat" />
      <p className="text-sm text-[var(--text-dim)]">Reviens demain pour un nouveau défi.</p>
    </section>
  );
}
