import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakeSocket } from "./net/fakeSocket.testkit.js";
import { App } from "./App.js";

// Même choix de seam que App.test.tsx : Room se connecte dès le montage, on ne veut jamais
// d'une vraie connexion socket.io-client dans ce fichier.
vi.mock("./net/socket.js", async () => {
  const kit = await import("./net/fakeSocket.testkit.js");
  return { getSocket: kit.getSocket };
});

// Preuve que le filet défini dans ErrorBoundary.tsx est bien CÂBLÉ dans App, pas seulement
// correct en isolation (voir ErrorBoundary.test.tsx pour les tests unitaires de la classe
// elle-même, avec le défaut réel — pokemonById — plutôt qu'un composant synthétique). Aucune
// route réelle ne lève facilement à la demande depuis l'extérieur d'un test (les identifiants
// invalides que pokemonById rejette viennent normalement d'un stockage local trafiqué ou du
// serveur, voir RoundResult.tsx) : on remplace donc une page entière par un composant qui lève,
// pour vérifier qu'App la rattrape bien.
vi.mock("./pages/Stats.js", () => ({
  Stats: () => {
    throw new Error("Panne simulée de /stats");
  },
}));

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFakeSocket();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  consoleErrorSpy.mockRestore();
});

describe("App — câblage de l'ErrorBoundary (issue #8)", () => {
  it("affiche un message de repli en français avec un retour à l'accueil au lieu d'une page blanche", () => {
    render(
      <MemoryRouter initialEntries={["/stats"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Un problème est survenu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
    // La page cassée elle-même n'a laissé aucune trace : preuve qu'on voit le repli, pas un
    // arbre partiellement rendu ni une page blanche.
    expect(screen.queryByText("Panne simulée de /stats")).toBeNull();
  });

  it("permet de repartir vers l'accueil après le message de repli, ErrorBoundary comprise", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/stats"]}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Retour à l'accueil" }));

    // Prouve que resetKey a bien réinitialisé la boundary : Routes remonte, on n'est pas
    // bloqué sur le repli. `waitFor` : le reset passe par `componentDidUpdate` → `setState`,
    // un second commit distinct de celui qui a changé `location.pathname` (voir la
    // justification dans ErrorBoundary.tsx) — pas garanti réglé au moment où `user.click` se
    // résout.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Pokémon Find" })).toBeInTheDocument();
    });
    // Pas d'assertion de focus ici, volontairement : voir le rapport pour la limite connue —
    // le reset de la boundary passe par un second commit (`componentDidUpdate` → `setState`),
    // postérieur au commit qui a fait tourner l'effet de focus d'issue #9 pour CE changement de
    // pathname précis. Le mécanisme de focus lui-même est prouvé indépendamment, sur des
    // navigations sans erreur, par les 19 tests d'App.test.tsx.
  });
});
