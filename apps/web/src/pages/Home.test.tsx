import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { KEYS } from "../storage/local.js";
import { Home } from "./Home.js";

afterEach(() => localStorage.clear());

/**
 * Monte `Home` sous un routeur avec, pour chaque destination possible, une page sentinelle
 * qui affiche le chemin emprunté. Prouve que le bouton navigue réellement vers la bonne
 * route — pas seulement qu'il existe à l'écran.
 */
function renderHome(): void {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/solo" element={<p>Route : /solo</p>} />
          <Route path="/daily" element={<p>Route : /daily</p>} />
          <Route path="/room/new" element={<p>Route : /room/new</p>} />
          <Route path="/join" element={<p>Route : /join</p>} />
          <Route path="/pokedex" element={<p>Route : /pokedex</p>} />
          <Route path="/stats" element={<p>Route : /stats</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("Home", () => {
  it.each([
    ["Jouer en solo", "/solo"],
    ["Défi du jour", "/daily"],
    ["Créer une room", "/room/new"],
    ["Rejoindre une room", "/join"],
    ["Pokédex", "/pokedex"],
    ["Statistiques", "/stats"],
  ])("le bouton « %s » navigue vers %s", async (label, path) => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: label }));

    expect(screen.getByText(`Route : ${path}`)).toBeInTheDocument();
  });

  it("enregistre le pseudo dans le stockage local avant de naviguer", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText("Ton pseudo"), "Sacha");
    await user.click(screen.getByRole("button", { name: "Jouer en solo" }));

    expect(localStorage.getItem(KEYS.nickname)).toBe(JSON.stringify("Sacha"));
  });

  it("supprime les espaces superflus du pseudo avant de l'enregistrer", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText("Ton pseudo"), "  Sacha  ");
    await user.click(screen.getByRole("button", { name: "Jouer en solo" }));

    expect(localStorage.getItem(KEYS.nickname)).toBe(JSON.stringify("Sacha"));
  });

  it("reprend le pseudo précédemment enregistré", () => {
    localStorage.setItem(KEYS.nickname, JSON.stringify("Ondine"));
    renderHome();

    expect(screen.getByLabelText("Ton pseudo")).toHaveValue("Ondine");
  });
});
