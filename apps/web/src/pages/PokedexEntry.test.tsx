import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDetailsCache } from "../pokedex/details.js";
import { Pokedex } from "./Pokedex.js";
import { PokedexEntry } from "./PokedexEntry.js";

const PIKACHU = {
  types: ["electric"],
  heightM: 0.4,
  weightKg: 6,
  genus: "Pokémon Souris",
  flavor: "Il stocke de l'électricité dans ses joues.",
  stats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
  evolution: [[172], [25], [26]],
};

beforeEach(() => {
  resetDetailsCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ "25": PIKACHU }) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/pokedex" element={<Pokedex />} />
        <Route path="/pokedex/:id" element={<PokedexEntry />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PokedexEntry — fiche plein écran", () => {
  it("affiche la fiche du Pokémon de l'adresse", async () => {
    show("/pokedex/25");
    expect(await screen.findByText("Pikachu")).toBeInTheDocument();
    expect(await screen.findByText("Électrik")).toBeInTheDocument();
    expect(screen.getByText("#0025")).toBeInTheDocument();
  });

  it("n'ouvre aucune surcouche : c'est une page, pas un dialogue", async () => {
    show("/pokedex/25");
    await screen.findByText("Pikachu");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("propose un retour vers la liste, en tête d'écran", async () => {
    show("/pokedex/25");
    expect(await screen.findByRole("link", { name: /Retour au Pokédex/ })).toBeInTheDocument();
  });

  it("reste lisible sur un numéro inexistant plutôt que de planter", () => {
    show("/pokedex/99999");
    expect(screen.getByText("Pokémon introuvable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Retour au Pokédex/ })).toBeInTheDocument();
  });

  it("reste lisible sur un identifiant qui n'est pas un nombre", () => {
    // L'adresse vient de n'importe qui : « abc » ne doit pas produire d'exception.
    show("/pokedex/abc");
    expect(screen.getByText("Pokémon introuvable")).toBeInTheDocument();
  });

  it("navigue vers la fiche depuis la grille au lieu d'ouvrir une surcouche", async () => {
    const user = userEvent.setup();
    show("/pokedex");

    await user.type(screen.getByRole("searchbox"), "pikachu");
    await user.click(screen.getByRole("button", { name: "Pikachu, voir la fiche" }));

    // On est bien sur la page dédiée : le bouton de retour au Pokédex l'atteste.
    expect(await screen.findByRole("link", { name: /Retour au Pokédex/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("suit une évolution en changeant d'adresse", async () => {
    const user = userEvent.setup();
    show("/pokedex/25");
    await screen.findByText("Pikachu");

    await user.click(screen.getByRole("tab", { name: "Évolutions" }));
    await user.click(screen.getByRole("button", { name: "Raichu, voir la fiche" }));

    expect(screen.getByText("#0026")).toBeInTheDocument();
  });
});
