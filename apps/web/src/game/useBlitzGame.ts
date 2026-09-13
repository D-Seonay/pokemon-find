import { type BlitzSettings, type Pool, buildPool, matchPokemonName } from "@pkfind/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type BlitzPhase = "playing" | "finished";

export type BlitzGame = {
  phase: BlitzPhase;
  pool: Pool;
  /** Les identifiants trouvés, dans l'ordre de découverte. */
  found: number[];
  remainingMs: number;
  /** Dernière saisie refusée, pour un retour visuel discret. */
  entry: string;
  submit: (value: string) => void;
  stop: () => void;
};

export function useBlitzGame(settings: BlitzSettings): BlitzGame {
  const pool = useMemo(() => buildPool(settings.generations), [settings.generations]);

  const [found, setFound] = useState<number[]>([]);
  const [entry, setEntry] = useState("");
  const [phase, setPhase] = useState<BlitzPhase>("playing");
  const [now, setNow] = useState(() => Date.now());
  const deadline = useRef(Date.now() + settings.durationMs);

  useEffect(() => {
    if (phase === "finished") return undefined;
    const handle = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(handle);
  }, [phase]);

  const remainingMs = Math.max(0, deadline.current - now);

  useEffect(() => {
    if (phase === "playing" && remainingMs === 0) setPhase("finished");
  }, [phase, remainingMs]);

  // Tout le pool trouvé : inutile de laisser tourner le chrono, la partie est gagnée.
  useEffect(() => {
    if (phase === "playing" && found.length === pool.ids.length) setPhase("finished");
  }, [found.length, phase, pool.ids.length]);

  const submit = useCallback(
    (value: string) => {
      setEntry(value);
      if (phase !== "playing") return;
      const match = matchPokemonName(value, pool);
      if (!match) return;
      setFound((current) => {
        // Retaper un Pokémon déjà trouvé ne le compte pas deux fois, mais vide quand même
        // le champ : sinon le joueur croit que sa frappe n'a pas été prise en compte.
        if (current.includes(match.id)) return current;
        return [...current, match.id];
      });
      setEntry("");
    },
    [phase, pool],
  );

  return {
    phase,
    pool,
    found,
    remainingMs,
    entry,
    submit,
    stop: () => setPhase("finished"),
  };
}
