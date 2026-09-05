import type { GenerationId } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SoloSetup } from "./SoloSetup.js";

// `GenerationPicker` refuse structurellement de faire passer `value` à un tableau vide (il
// bloque le retrait de la dernière génération cochée) : on ne peut donc pas atteindre cet état
// en pilotant le vrai composant depuis un test. On le remplace ici par un bouton de test qui
// appelle `onChange([])` directement, pour vérifier le comportement de `SoloSetup` — le bouton
// "Lancer" doit se désactiver — indépendamment de la garde du picker.
vi.mock("../components/GenerationPicker.js", () => ({
  GenerationPicker: ({ onChange }: { onChange: (next: GenerationId[]) => void }) => (
    <button type="button" onClick={() => onChange([])}>
      Vider les générations (test)
    </button>
  ),
}));

function renderSetup() {
  render(
    <MemoryRouter initialEntries={["/solo"]}>
      <Routes>
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/solo/play" element={<p>Partie lancée</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SoloSetup", () => {
  it("propose les trois durées et les trois formats de partie", () => {
    renderSetup();
    expect(screen.getByRole("radio", { name: "10 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "15 s" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "25 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10 manches" })).toBeChecked();
  });

  it("lance la partie", async () => {
    renderSetup();
    await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
    expect(screen.getByText("Partie lancée")).toBeInTheDocument();
  });

  it("désactive le lancement quand aucune génération n'est sélectionnée", async () => {
    renderSetup();
    await userEvent.click(screen.getByRole("button", { name: /vider les générations/i }));
    expect(screen.getByRole("button", { name: /lancer/i })).toBeDisabled();
  });
});
