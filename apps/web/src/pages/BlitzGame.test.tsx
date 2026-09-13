import { DEFAULT_BLITZ_SETTINGS } from "@pkfind/shared";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlitzGame } from "./BlitzGame.js";

function show(settings = DEFAULT_BLITZ_SETTINGS) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/blitz/play", state: settings }]}>
      <Routes>
        <Route path="/blitz/play" element={<BlitzGame />} />
        <Route path="/blitz" element={<p>Réglages</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function field(): HTMLElement {
  return screen.getByLabelText("Nommer un Pokémon");
}

function slotFor(name: string): HTMLElement {
  const cell = screen.getByText(name).closest("li");
  if (!cell) throw new Error(`Case introuvable pour ${name}`);
  return cell;
}

describe("Contre la montre — solo", () => {
  it("affiche toutes les cases du pool dès le départ, vides", () => {
    show();
    // 151 cases pour la génération 1, aucune remplie.
    expect(screen.getAllByRole("listitem")).toHaveLength(151);
    expect(screen.queryByText("Bulbizarre")).toBeNull();
    expect(screen.getByText("0 / 151")).toBeInTheDocument();
  });

  it("remplit la case dès que le nom est complet, sans valider", async () => {
    const user = userEvent.setup();
    show();
    await user.type(field(), "bulbizarre");

    expect(within(slotFor("Bulbizarre")).getByRole("img", { name: "Bulbizarre" })).toBeDefined();
    expect(screen.getByText("1 / 151")).toBeInTheDocument();
    // Le champ se vide tout seul : on enchaîne sans avoir à effacer.
    expect(field()).toHaveValue("");
  });

  it("accepte le nom anglais", async () => {
    const user = userEvent.setup();
    show();
    await user.type(field(), "bulbasaur");
    expect(screen.getByText("1 / 151")).toBeInTheDocument();
  });

  it("ne compte pas deux fois le même Pokémon", async () => {
    const user = userEvent.setup();
    show();
    await user.type(field(), "pikachu");
    await user.type(field(), "pikachu");
    expect(screen.getByText("1 / 151")).toBeInTheDocument();
  });

  it("ignore un Pokémon hors du pool choisi", async () => {
    const user = userEvent.setup();
    show();
    // Héricendre est de génération 2 : la partie porte sur la première.
    await user.type(field(), "hericendre");
    expect(screen.getByText("0 / 151")).toBeInTheDocument();
  });

  it("ne suggère jamais de noms, ce qui donnerait les réponses", async () => {
    const user = userEvent.setup();
    show();
    await user.type(field(), "bulbi");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("option")).toBeNull();
    // La saisie partielle ne remplit rien non plus.
    expect(screen.getByText("0 / 151")).toBeInTheDocument();
  });

  it("donne le focus au champ, pour ne pas perdre de secondes à cliquer", () => {
    show();
    expect(document.activeElement).toBe(field());
  });
});

describe("Contre la montre — fin de partie", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("s'arrête à l'expiration du temps et montre les manqués", () => {
    show({ ...DEFAULT_BLITZ_SETTINGS, durationMs: 60_000 });

    act(() => vi.advanceTimersByTime(61_000));

    expect(screen.getByText("Temps écoulé")).toBeInTheDocument();
    expect(screen.getByText("0 / 151")).toBeInTheDocument();
    // Les manqués sont révélés : c'est l'intérêt de l'écran de fin.
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
  });

  it("laisse terminer avant la fin du temps", () => {
    show();
    act(() => {
      screen.getByRole("button", { name: "Terminer maintenant" }).click();
    });
    expect(screen.getByText("Temps écoulé")).toBeInTheDocument();
  });
});
