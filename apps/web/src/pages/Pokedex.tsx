import { Link } from "react-router-dom";
import { PokedexBrowser } from "../components/PokedexBrowser.js";

export function Pokedex() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">Pokédex</h1>
      <p className="text-[var(--text-dim)]">
        La liste complète, avec les numéros. De quoi réviser avant une partie — ou vérifier après
        coup à côté de quoi vous êtes passé.
      </p>

      <PokedexBrowser />

      <Link to="/" className="underline">
        Retour à l&apos;accueil
      </Link>
    </section>
  );
}
