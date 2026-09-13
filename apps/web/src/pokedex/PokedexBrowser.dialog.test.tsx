import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokedexBrowser } from "../components/PokedexBrowser.js";
import { resetDetailsCache } from "./details.js";

const BULBIZARRE = {
  types: ["grass", "poison"],
  heightM: 0.7,
  weightKg: 6.9,
  genus: "Pokémon Graine",
  flavor: "Il passe son temps à faire la sieste au soleil.",
  stats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
};

function stubFetch(impl: () => Promise<unknown>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

beforeEach(() => {
  resetDetailsCache();
  stubFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ "1": BULBIZARRE }) }));
});

afterEach(() => vi.unstubAllGlobals());

describe("Pokédex — fiche détaillée", () => {
  it("présente les Pokémon en fiches cliquables plutôt qu'en lignes", async () => {
    render(<PokedexBrowser initialGenerations={[1]} />);
    expect(
      await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" }),
    ).toBeInTheDocument();
  });

  it("affiche les types une fois les détails chargés", async () => {
    render(<PokedexBrowser initialGenerations={[1]} />);
    const card = await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" });
    await waitFor(() => expect(within(card).getByText("Plante")).toBeInTheDocument());
    expect(within(card).getByText("Poison")).toBeInTheDocument();
  });

  it("ouvre la fiche au clic, avec les données détaillées", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    const card = await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" });
    await waitFor(() => expect(within(card).getByText("Plante")).toBeInTheDocument());

    await user.click(card);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Bulbizarre" })).toBeInTheDocument();
    expect(within(dialog).getByText("Pokémon Graine")).toBeInTheDocument();
    expect(within(dialog).getByText(/sieste au soleil/)).toBeInTheDocument();
    expect(within(dialog).getByText("0,7 m")).toBeInTheDocument();
    expect(within(dialog).getByText("6,9 kg")).toBeInTheDocument();
  });

  it("donne le focus à la fiche pour ne pas le laisser sous la surcouche", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.click(await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" }));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("ferme la fiche avec Échap", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.click(await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ferme la fiche avec le bouton dédié", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.click(await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" }));
    await user.click(screen.getByRole("button", { name: "Fermer la fiche" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reste utilisable si le fichier de détails ne charge pas", async () => {
    resetDetailsCache();
    stubFetch(() => Promise.reject(new Error("réseau coupé")));
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);

    // La grille et la recherche marchent toujours : seules les données détaillées manquent.
    const card = await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" });
    await user.click(card);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Fiche détaillée indisponible/)).toBeInTheDocument();
  });

  it("ignore une entrée de forme inattendue plutôt que de planter", async () => {
    resetDetailsCache();
    stubFetch(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ "1": { types: "plante" } }) }),
    );
    render(<PokedexBrowser initialGenerations={[1]} />);
    const card = await screen.findByRole("button", { name: "Bulbizarre, voir la fiche" });
    // Pas de pastille : l'entrée invalide est écartée, la carte reste affichée.
    expect(within(card).queryByText("Plante")).toBeNull();
  });
});
