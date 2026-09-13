import { MAX_POKEMON_ID, tryPokemonById } from "@pkfind/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { type DetailMap, loadDetails } from "../pokedex/details.js";
import { PokemonDetailView } from "../pokedex/PokemonDetailView.js";

/**
 * La fiche en plein écran, adressable : `/pokedex/25` se partage et s'ouvre directement.
 * Le lobby multijoueur garde la version en surcouche — y naviguer ferait quitter la room.
 */
export function PokedexEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<DetailMap>({});

  useEffect(() => {
    let alive = true;
    loadDetails()
      .then((loaded) => {
        if (alive) setDetails(loaded);
      })
      .catch(() => {
        /* table vide : la fiche s'affiche en mode dégradé. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // `id` vient de l'URL, donc de n'importe qui : « abc » ou « 99999 » doivent aboutir à
  // un écran lisible, pas à une exception de rendu.
  const parsed = Number(id);
  const pokemon = Number.isInteger(parsed) ? tryPokemonById(parsed) : undefined;

  if (!pokemon) {
    return (
      <section className="flex flex-col gap-4">
        <BackLink to="/pokedex" label="Retour au Pokédex" />
        <h1 className="text-2xl font-extrabold">Pokémon introuvable</h1>
        <p className="text-[var(--text-dim)]">
          Aucun Pokémon ne porte le numéro « {id} ». Le Pokédex national va de 1 à {MAX_POKEMON_ID}.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <BackLink to="/pokedex" label="Retour au Pokédex" />
      <PokemonDetailView
        pokemon={pokemon}
        detail={details[String(pokemon.id)]}
        maxId={MAX_POKEMON_ID}
        headingLevel="h1"
        // Suivre une évolution change d'adresse : l'historique du navigateur suit, donc
        // le bouton Précédent ramène à la fiche d'où l'on vient.
        onSelect={(next) => navigate(`/pokedex/${next.id}`)}
      />
    </section>
  );
}
