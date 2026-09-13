import { type Pokemon, pokemonById } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PokemonDetail } from "./details.js";
import { PokemonDetailView } from "./PokemonDetailView.js";

const bulbizarre: PokemonDetail = {
  types: ["grass", "poison"],
  heightM: 0.7,
  weightKg: 6.9,
  genus: "Pokémon Graine",
  flavor: "Il passe son temps à faire la sieste au soleil.",
  stats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  evolution: [[1], [2], [3]],
};

function show(detail: PokemonDetail | undefined, id = 1, onSelect?: (next: Pokemon) => void) {
  return render(
    <PokemonDetailView
      pokemon={pokemonById(id)}
      detail={detail}
      maxId={151}
      {...(onSelect ? { onSelect } : {})}
    />,
  );
}

describe("PokemonDetailView", () => {
  it("met le numéro en évidence, puisque c'est lui que le jeu fait deviner", () => {
    show(bulbizarre);
    expect(screen.getByText("#001")).toBeInTheDocument();
  });

  it("écrit les types en toutes lettres sous le nom", () => {
    show(bulbizarre);
    expect(screen.getByText("Plante / Poison")).toBeInTheDocument();
  });

  it("ouvre sur l'onglet À propos", () => {
    show(bulbizarre);
    expect(screen.getByRole("tab", { name: "À propos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/sieste au soleil/)).toBeInTheDocument();
  });

  it("bascule sur les évolutions et montre la famille", async () => {
    const user = userEvent.setup();
    show(bulbizarre);

    await user.click(screen.getByRole("tab", { name: "Évolutions" }));

    expect(screen.getByText("Herbizarre")).toBeInTheDocument();
    expect(screen.getByText("Florizarre")).toBeInTheDocument();
    // La description appartient à l'autre onglet : elle ne doit plus être là.
    expect(screen.queryByText(/sieste au soleil/)).toBeNull();
  });

  it("permet de sauter à une autre évolution, mais pas à celle affichée", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    show(bulbizarre, 1, onSelect);
    await user.click(screen.getByRole("tab", { name: "Évolutions" }));

    // Bulbizarre est la fiche courante : rien à aller voir, donc pas de bouton.
    expect(screen.queryByRole("button", { name: "Bulbizarre, voir la fiche" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Herbizarre, voir la fiche" }));
    expect(onSelect).toHaveBeenCalledWith(pokemonById(2));
  });

  it("gère les familles ramifiées, où un étage compte plusieurs Pokémon", async () => {
    const user = userEvent.setup();
    // Évoli : huit évolutions au MÊME étage, pas une succession.
    show({ ...bulbizarre, evolution: [[133], [134, 135, 136]] }, 133);
    await user.click(screen.getByRole("tab", { name: "Évolutions" }));

    for (const name of ["Aquali", "Voltali", "Pyroli"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("dit clairement qu'un Pokémon n'évolue pas", async () => {
    const user = userEvent.setup();
    show({ ...bulbizarre, evolution: [[1]] });
    await user.click(screen.getByRole("tab", { name: "Évolutions" }));
    expect(screen.getByText(/n'évolue pas/)).toBeInTheDocument();
  });

  it("reste lisible sans fiche détaillée, sans proposer d'onglets vides", () => {
    show(undefined);
    expect(screen.getByRole("heading", { name: "Bulbizarre" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText(/indisponible/)).toBeInTheDocument();
  });

  it("borne la barre d'une statistique exceptionnelle à la largeur du rail", () => {
    const { container } = show({ ...bulbizarre, stats: { ...bulbizarre.stats, hp: 255 } });
    const bars = [...container.querySelectorAll("span[style*='width']")];
    const widths = bars.map((b) => (b as HTMLElement).style.width);
    // 255 dépasse l'échelle d'affichage (180) : la barre sature au lieu de déborder.
    expect(widths).toContain("100%");
  });
});

describe("PokemonDetailView — nom anglais", () => {
  it("ne répète pas le nom quand les deux langues coïncident", () => {
    // Pikachu s'appelle Pikachu partout : l'afficher deux fois fait douter de ce qu'on lit.
    render(<PokemonDetailView pokemon={pokemonById(25)} detail={bulbizarre} maxId={151} />);
    expect(screen.getAllByText("Pikachu")).toHaveLength(1);
  });

  it("affiche le nom anglais quand il diffère", () => {
    render(<PokemonDetailView pokemon={pokemonById(83)} detail={bulbizarre} maxId={151} />);
    expect(screen.getByText("Farfetch’d")).toBeInTheDocument();
  });
});
