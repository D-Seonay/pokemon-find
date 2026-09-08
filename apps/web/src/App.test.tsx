import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFakeSocket } from "./net/fakeSocket.testkit.js";
import { App } from "./App.js";

// `/room/:code` monte `Room`, qui se connecte via `useRoom` dès le montage : sans ce
// double, ce test tenterait une vraie connexion `socket.io-client`. Même choix de seam que
// `Room.test.tsx` et `useRoom.test.tsx`.
vi.mock("./net/socket.js", async () => {
  const kit = await import("./net/fakeSocket.testkit.js");
  return { getSocket: kit.getSocket };
});

beforeEach(() => resetFakeSocket());
afterEach(() => localStorage.clear());

function renderAt(entry: string | { pathname: string; state?: unknown }): void {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("App", () => {
  it("affiche l'accueil sur /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "Pokémon Find" })).toBeInTheDocument();
  });

  it("affiche les réglages de la partie solo sur /solo", () => {
    renderAt("/solo");
    expect(screen.getByRole("heading", { name: "Partie solo" })).toBeInTheDocument();
  });

  it("affiche la partie solo sur /solo/play quand des réglages valides sont fournis", () => {
    renderAt({ pathname: "/solo/play", state: DEFAULT_SETTINGS });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("affiche le défi du jour sur /daily", () => {
    renderAt("/daily");
    expect(screen.getByRole("heading", { name: /Défi du jour/ })).toBeInTheDocument();
  });

  it("affiche le pokédex sur /pokedex", () => {
    renderAt("/pokedex");
    expect(screen.getByRole("heading", { name: "Pokédex" })).toBeInTheDocument();
  });

  it("affiche les statistiques sur /stats", () => {
    renderAt("/stats");
    expect(screen.getByRole("heading", { name: "Statistiques" })).toBeInTheDocument();
  });

  it("affiche le formulaire pour rejoindre une room sur /join", () => {
    renderAt("/join");
    expect(screen.getByRole("heading", { name: "Rejoindre une room" })).toBeInTheDocument();
  });

  it("affiche la room sur /room/:code", () => {
    renderAt("/room/ABCD");
    // Avant l'accusé de réception du serveur, `Room` affiche cet état de chargement — la
    // preuve que la route a bien monté le composant `Room`, pas seulement une page vide.
    expect(screen.getByText("Connexion…")).toBeInTheDocument();
  });

  it("retombe sur l'accueil pour une route inconnue", () => {
    renderAt("/cette-route-n-existe-pas");
    expect(screen.getByRole("heading", { name: "Pokémon Find" })).toBeInTheDocument();
  });
});
