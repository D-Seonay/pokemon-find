import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Pokedex } from "./Pokedex.js";

function renderPokedex() {
  render(
    <MemoryRouter>
      <Pokedex />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** La ligne de liste qui contient ce texte. */
function rowFor(name: string): HTMLElement {
  const element = screen.getByText(name).closest("li");
  if (!element) throw new Error(`Aucune ligne pour ${name}`);
  return element;
}

describe("Pokedex", () => {
  it("affiche le numéro national de chaque Pokémon", async () => {
    renderPokedex();
    expect(within(rowFor("Pikachu")).getByText("#0025")).toBeInTheDocument();
  });

  it("affiche le nom anglais quand il diffère du français", () => {
    renderPokedex();
    // Canarticho s'appelle Farfetch'd en anglais — c'est l'intérêt de la liste.
    expect(within(rowFor("Canarticho")).getByText("Farfetch’d")).toBeInTheDocument();
  });

  it("n'affiche pas deux fois le nom quand les deux langues coïncident", () => {
    renderPokedex();
    expect(within(rowFor("Pikachu")).getAllByText("Pikachu")).toHaveLength(1);
  });

  it("filtre à la recherche", async () => {
    const user = renderPokedex();
    await user.type(screen.getByRole("searchbox"), "pika");
    expect(screen.getByText("Pikachu")).toBeInTheDocument();
    expect(screen.queryByText("Bulbizarre")).toBeNull();
  });

  it("cherche aussi par le nom anglais", async () => {
    const user = renderPokedex();
    await user.type(screen.getByRole("searchbox"), "charizard");
    expect(screen.getByText("Dracaufeu")).toBeInTheDocument();
  });

  it("restreint la liste à la génération choisie", async () => {
    const user = renderPokedex();
    expect(screen.getByText("Lucario")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /gén 1 seulement/i }));
    expect(screen.getByText("Mewtwo")).toBeInTheDocument();
    expect(screen.queryByText("Lucario")).toBeNull();
  });

  it("annonce le nombre d'entrées affichées", async () => {
    const user = renderPokedex();
    await user.click(screen.getByRole("button", { name: /gén 1 seulement/i }));
    expect(screen.getByText(/151 Pokémon/)).toBeInTheDocument();
  });

  it("le dit quand la recherche ne trouve rien", async () => {
    const user = renderPokedex();
    await user.type(screen.getByRole("searchbox"), "zzzzzz");
    expect(screen.getByText(/Aucun Pokémon/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
