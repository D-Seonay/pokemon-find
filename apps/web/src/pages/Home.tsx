import type { GameMode } from "@pkfind/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { KEYS, readJson, writeJson } from "../storage/local.js";

/**
 * Une carte par jeu, et dans chacune le choix seul ou à plusieurs.
 *
 * La liste plate d'origine mêlait deux questions sans le dire : à quel jeu on joue, et
 * avec qui. « Jouer en solo » et « Contre la montre » étaient tous deux du solo, et
 * « Créer une room » ne disait pas à quel jeu elle servirait.
 */
function GameCard({
  title,
  description,
  soloPath,
  mode,
  extra,
  go,
}: {
  title: string;
  description: string;
  soloPath: string;
  mode: GameMode;
  extra?: { label: string; path: string };
  go: (path: string, state?: { mode: GameMode }) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        <p className="text-sm text-[var(--text-dim)]">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => go(soloPath)}>Solo</Button>
        {/* Le mode voyage avec la navigation : la room s'ouvre déjà réglée sur ce jeu,
            au lieu de laisser l'hôte le choisir une seconde fois dans le lobby. */}
        <Button variant="ghost" onClick={() => go("/room/new", { mode })}>
          Multijoueur
        </Button>
        {extra && (
          <Button variant="ghost" className="sm:col-span-2" onClick={() => go(extra.path)}>
            {extra.label}
          </Button>
        )}
      </div>
    </section>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => readJson(KEYS.nickname, ""));

  function go(path: string, state?: { mode: GameMode }): void {
    writeJson(KEYS.nickname, nickname.trim());
    navigate(path, state ? { state } : {});
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl font-extrabold">Pokémon Find</h1>
        <p className="text-[var(--text-dim)]">Deux jeux, seul ou entre amis.</p>
      </div>

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

      <GameCard
        title="Trouver le numéro"
        description="Un numéro du Pokédex s'affiche. Nomme le Pokémon, ou approche-toi le plus possible."
        soloPath="/solo"
        mode="classic"
        extra={{ label: "Défi du jour", path: "/daily" }}
        go={go}
      />

      <GameCard
        title="Contre la montre"
        description="Nomme le plus de Pokémon possible avant la fin du temps."
        soloPath="/blitz"
        mode="blitz"
        go={go}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="ghost" onClick={() => go("/join")}>
          Rejoindre une room
        </Button>
        <Button variant="ghost" onClick={() => go("/pokedex")}>
          Pokédex
        </Button>
        <Button variant="ghost" onClick={() => go("/stats")}>
          Statistiques
        </Button>
      </div>
    </section>
  );
}
