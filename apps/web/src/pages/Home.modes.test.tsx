import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Home } from "./Home.js";

afterEach(() => localStorage.clear());

function show() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/solo" element={<p>Réglages solo</p>} />
        <Route path="/blitz" element={<p>Réglages blitz</p>} />
        <Route path="/daily" element={<p>Défi</p>} />
        <Route path="/room/new" element={<p>Nouvelle room</p>} />
        <Route path="/join" element={<p>Rejoindre</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function gameCard(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const card = heading.closest("section");
  if (!card) throw new Error(`Carte introuvable pour ${title}`);
  return card;
}

describe("Accueil — les deux jeux, chacun en solo ou en multi", () => {
  it("présente les deux jeux séparément plutôt qu'en liste plate", () => {
    show();
    expect(screen.getByRole("heading", { name: "Trouver le numéro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contre la montre" })).toBeInTheDocument();
  });

  it("offre solo et multi pour chaque jeu", () => {
    show();
    for (const title of ["Trouver le numéro", "Contre la montre"]) {
      const card = gameCard(title);
      expect(within(card).getByRole("button", { name: "Solo" })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Multijoueur" })).toBeInTheDocument();
    }
  });

  it("réserve le défi du jour au jeu qui le porte", () => {
    show();
    expect(
      within(gameCard("Trouver le numéro")).getByRole("button", { name: "Défi du jour" }),
    ).toBeInTheDocument();
    expect(
      within(gameCard("Contre la montre")).queryByRole("button", { name: "Défi du jour" }),
    ).toBeNull();
  });

  it("mène au bon écran solo depuis chaque jeu", async () => {
    const user = userEvent.setup();
    show();
    await user.click(within(gameCard("Contre la montre")).getByRole("button", { name: "Solo" }));
    expect(screen.getByText("Réglages blitz")).toBeInTheDocument();
  });

  it("enregistre le pseudo avant de partir, quel que soit le chemin", async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText(/pseudo/i), "Léa");
    await user.click(within(gameCard("Trouver le numéro")).getByRole("button", { name: "Solo" }));
    expect(localStorage.getItem("pkfind.nickname.v1")).toContain("Léa");
  });
});
