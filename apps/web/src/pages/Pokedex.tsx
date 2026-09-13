import { useNavigate } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { PokedexBrowser } from "../components/PokedexBrowser.js";

export function Pokedex() {
  const navigate = useNavigate();

  return (
    <section className="flex flex-col gap-4">
      <BackLink />
      <h1 className="text-3xl font-extrabold">Pokédex</h1>
      <p className="text-[var(--text-dim)]">
        La liste complète, avec les numéros. De quoi réviser avant une partie — ou vérifier après
        coup à côté de quoi vous êtes passé.
      </p>

      <PokedexBrowser onSelect={(pokemon) => navigate(`/pokedex/${pokemon.id}`)} />
    </section>
  );
}
