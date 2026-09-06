import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

export function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  function go(path: string): void {
    writeJson(KEYS.nickname, nickname.trim());
    navigate(path);
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-4xl font-extrabold">Pokémon Find</h1>
      <p className="text-[var(--text-dim)]">
        Un numéro s'affiche. Trouve le Pokémon — exact, ou le plus proche possible.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-[var(--text-dim)]">Ton pseudo</span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={16}
          placeholder="Sacha"
          className="h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3"
        />
      </label>
      <div className="grid gap-3">
        <Button onClick={() => go("/solo")}>Jouer en solo</Button>
        <Button variant="ghost" onClick={() => go("/daily")}>
          Défi du jour
        </Button>
        <Button variant="ghost" onClick={() => go("/room/new")}>
          Créer une room
        </Button>
        <Button variant="ghost" onClick={() => go("/join")}>
          Rejoindre une room
        </Button>
        <Button variant="ghost" onClick={() => go("/pokedex")}>
          Pokédex
        </Button>
      </div>
    </section>
  );
}
