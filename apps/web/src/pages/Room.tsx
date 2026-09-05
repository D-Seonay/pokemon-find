import { buildPool } from "@pkfind/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button.js";
import { GenerationPicker } from "../components/GenerationPicker.js";
import { MultiReveal } from "../components/MultiReveal.js";
import { PokemonCombobox } from "../components/PokemonCombobox.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { TargetNumber } from "../components/TargetNumber.js";
import { Timer } from "../components/Timer.js";
import { useRoom } from "../net/useRoom.js";
import { KEYS, readJson } from "../storage/local.js";

export function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const nickname = readJson(KEYS.nickname, "Dresseur");
  const room = useRoom({
    code,
    nickname,
    create: code === "new",
    onCreated: (realCode) => navigate(`/room/${realCode}`, { replace: true }),
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(handle);
  }, []);

  if (room.closed) return <p>La room a été fermée ({room.closed}).</p>;
  if (room.error) return <p style={{ color: "var(--danger)" }}>{room.error}</p>;
  if (!room.state) return <p>Connexion…</p>;

  const state = room.state;
  const isHost = state.players.find((player) => player.id === room.playerId)?.isHost ?? false;
  const pool = buildPool(state.settings.generations);

  if (room.final) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-extrabold">Classement final</h1>
        <Scoreboard
          standings={room.final.standings}
          {...(room.playerId ? { highlightPlayerId: room.playerId } : {})}
        />
        {isHost && <Button onClick={room.actions.playAgain}>Rejouer</Button>}
      </section>
    );
  }

  if (room.reveal) {
    return (
      <MultiReveal target={room.reveal.target} results={room.reveal.results} maxId={pool.maxId} />
    );
  }

  if (room.round) {
    return (
      <section className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <p className="mono text-[var(--text-dim)]">
            Manche {room.round.roundIndex + 1} / {room.round.roundCount}
          </p>
          <ul className="flex gap-1">
            {state.players.map((player) => (
              <li
                key={player.id}
                title={player.nickname}
                aria-label={`${player.nickname} ${player.hasAnswered ? "a répondu" : "réfléchit"}`}
                className="h-3 w-3 rounded-full"
                style={{
                  background: player.hasAnswered ? "var(--success)" : "var(--border)",
                  opacity: player.connected ? 1 : 0.3,
                }}
              />
            ))}
          </ul>
        </header>
        <Timer
          remainingMs={room.round.localEndsAt - now}
          totalMs={state.settings.roundDurationMs}
        />
        <TargetNumber id={room.round.targetId} maxId={pool.maxId} />
        <PokemonCombobox pool={pool} onSubmit={(pokemon) => room.actions.answer(pokemon.id)} />
      </section>
    );
  }

  if (state.status === "countdown") {
    return <p className="mono text-center text-6xl">Ça commence…</p>;
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold">Room</h1>
      <p className="mono text-6xl tracking-[0.3em]">{state.code}</p>
      <Button
        variant="ghost"
        onClick={() =>
          void navigator.clipboard.writeText(`${window.location.origin}/room/${state.code}`)
        }
      >
        Copier le lien
      </Button>
      <ul className="flex flex-col gap-2">
        {state.players.map((player) => (
          <li key={player.id} className="flex items-center gap-2">
            <span style={{ opacity: player.connected ? 1 : 0.4 }}>{player.nickname}</span>
            {player.isHost && <span aria-label="hôte">👑</span>}
          </li>
        ))}
      </ul>
      {isHost ? (
        <GenerationPicker
          value={state.settings.generations}
          onChange={(generations) => room.actions.setSettings({ ...state.settings, generations })}
        />
      ) : (
        <p className="text-[var(--text-dim)]">
          Générations : {state.settings.generations.join(", ")} ·{" "}
          {state.settings.roundDurationMs / 1000} s · {state.settings.roundCount} manches
        </p>
      )}
      {isHost && (
        <>
          <Button
            disabled={state.players.filter((player) => player.connected).length < 2}
            onClick={room.actions.start}
          >
            Démarrer
          </Button>
          {state.players.filter((player) => player.connected).length < 2 && (
            <p className="text-sm text-[var(--text-dim)]">Il faut au moins 2 joueurs connectés.</p>
          )}
        </>
      )}
    </section>
  );
}
