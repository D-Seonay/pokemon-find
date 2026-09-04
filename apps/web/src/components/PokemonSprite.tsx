import type { Pokemon } from "@pkfind/shared";
import { useEffect, useState } from "react";

export function PokemonSprite({ pokemon, size = 64 }: { pokemon: Pokemon; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [pokemon.id]);

  if (failed) {
    return (
      <span
        role="img"
        aria-label={pokemon.nameFr}
        className="mono inline-flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: "var(--surface-2)",
          color: "var(--text-dim)",
          fontSize: size * 0.4,
        }}
      >
        {pokemon.nameFr.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={pokemon.spriteUrl}
      alt={pokemon.nameFr}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
