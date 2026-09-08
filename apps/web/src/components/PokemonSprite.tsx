import type { Pokemon } from "@pkfind/shared";
import { useEffect, useState } from "react";

/** Côté natif des sprites auto-hébergés (voir `scripts/fetch-sprites.ts`). */
const NATIVE_SIZE = 96;

export function PokemonSprite({ pokemon, size = 64 }: { pokemon: Pokemon; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [pokemon.id]);

  // Au-delà de la taille native, le lissage par défaut du navigateur transforme le sprite
  // en bouillie floue ; `pixelated` garde des pixels francs, ce qui est le rendu attendu
  // pour ce genre d'image. En dessous (les vignettes de 40 px du Pokédex), c'est l'inverse :
  // le lissage est ce qui rend la réduction lisible, donc on n'y touche pas.
  const rendering = size > NATIVE_SIZE ? "pixelated" : "auto";

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
      style={{ width: size, height: size, objectFit: "contain", imageRendering: rendering }}
    />
  );
}
