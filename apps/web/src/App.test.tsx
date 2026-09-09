import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("App — focus et annonce au changement de route (issue #9)", () => {
  it("ne vole pas le focus au premier chargement", () => {
    renderAt("/pokedex");
    // Le comportement natif du navigateur est déjà correct sur un premier chargement : le
    // voler ici — même vers un <h1> par ailleurs légitime — serait exactement le défaut
    // d'accessibilité que cette issue interdit.
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: "Pokédex" }));
    expect(document.activeElement).toBe(document.body);
  });

  it("déplace le focus sur le titre de la page d'arrivée en passant de l'accueil aux réglages solo", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Jouer en solo" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Partie solo" }));
  });

  it("laisse PokemonCombobox garder son propre focus automatique sur /daily, malgré la présence d'un <h1>", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Défi du jour" }));
    // Contrairement aux autres routes ci-dessous, /daily atterrit directement en pleine
    // manche chronométrée : PokemonCombobox y a déjà déplacé le focus sur son champ de
    // réponse avant qu'App n'ait la main (voir la garde `activeElement !== body` dans App.tsx),
    // même si un <h1> ("Défi du jour — …") existe bel et bien sur cette page.
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("déplace le focus sur le titre de la page d'arrivée en passant de l'accueil au pokédex", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Pokédex" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pokédex" }));
  });

  it("déplace le focus sur le titre de la page d'arrivée en passant de l'accueil aux statistiques", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Statistiques" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Statistiques" }));
  });

  it("déplace le focus sur le titre de la page d'arrivée en passant de l'accueil au formulaire pour rejoindre une room", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Rejoindre une room" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Rejoindre une room" }),
    );
  });

  it("laisse PokemonCombobox garder son propre focus automatique sur /solo/play, faute de <h1> sur cette page", async () => {
    const user = userEvent.setup();
    renderAt("/solo");
    await user.click(screen.getByRole("button", { name: "Lancer" }));
    // SoloGame n'a AUCUN <h1> tant qu'une manche est en cours (voir le rapport : contrairement
    // à d'autres pages sans titre, en ajouter un ici serait activement nuisible — PokemonCombobox
    // se focalise déjà lui-même sur son champ de réponse dès son montage, et comme App est un
    // ancêtre, son effet de focus tournerait APRÈS celui de PokemonCombobox et le lui volerait
    // en pleine manche chronométrée. L'effet d'App trouve donc `null` via `querySelector("h1")`
    // et ne fait rien, exactement le comportement "ne pas forcer" voulu dans ce cas précis.
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("déplace le focus sur le titre de l'accueil en y revenant via un lien, pas seulement via navigate()", async () => {
    const user = userEvent.setup();
    renderAt("/pokedex");
    await user.click(screen.getByRole("link", { name: "Retour à l'accueil" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pokémon Find" }));
  });

  it("laisse PokemonCombobox garder son focus même hors StrictMode, où App gagnerait la course sans la garde activeElement", async () => {
    // Les autres tests de ce bloc utilisent `renderAt` (StrictMode) : sous StrictMode, le
    // second passage de l'effet de PokemonCombobox (remontage simulé, propre au
    // développement) survient déjà APRÈS celui d'App et masque donc, à lui seul, tout défaut
    // de la garde `activeElement !== body`. Ce test rend SANS StrictMode — le chemin réel de
    // production — où seul l'ordre naturel des effets (enfant avant ancêtre) est en jeu : sans
    // cette garde, App (l'ancêtre) s'exécute en dernier et gagne, volant le focus du champ de
    // réponse. Route choisie délibérément (/daily, pas /solo/play) : elle a un <h1> bien réel,
    // donc seule la garde `activeElement`, pas l'absence de titre, peut empêcher App de le lui
    // voler ici. Voir le rapport pour la mesure : retirer la garde fait échouer précisément ce
    // test, aucun autre.
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Défi du jour" }));
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("ne force aucun focus sur /room/:code tant qu'aucun titre n'est encore monté (connexion en cours)", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Créer une room" }));
    // `Room` n'a pas encore de <h1> à ce stade — voir Room.tsx, l'état "Connexion…" est un
    // simple paragraphe tant que le serveur n'a pas répondu. L'effet ne doit rien casser ni
    // focaliser un élément non pertinent : voir le rapport pour la justification de ne pas
    // forcer davantage (un nouvel essai à l'arrivée tardive de l'état serveur risquerait de
    // voler le focus en pleine partie, bien plus tard, si la room est rejointe en cours de
    // manche sans jamais montrer de lobby).
    expect(screen.getByText("Connexion…")).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });
});
