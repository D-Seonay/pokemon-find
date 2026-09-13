import { DEFAULT_SETTINGS, UNLIMITED_ROUND_MS } from "@pkfind/shared";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SoloGame } from "./SoloGame.js";

function renderSoloGame(settings = DEFAULT_SETTINGS) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/solo/play", state: settings }]}>
      <Routes>
        <Route path="/solo/play" element={<SoloGame />} />
        <Route path="/solo" element={<p>Réglages</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SoloGame", () => {
  it("déplace le focus sur le panneau de révélation après une réponse, au lieu de le laisser sur le champ désactivé", async () => {
    const user = userEvent.setup();
    renderSoloGame();

    const input = screen.getByRole("combobox");
    await user.type(input, "pika");
    await user.keyboard("{Enter}{Enter}");

    // Le champ de réponse a disparu avec la manche : seul le panneau de révélation porte
    // encore un rôle "button" (pour qu'Entrée enchaîne sur la manche suivante).
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button"));
  });
});

describe("SoloGame — sans limite de temps", () => {
  it("ne termine pas la manche toute seule, même longtemps après", () => {
    vi.useFakeTimers();
    try {
      renderSoloGame({ ...DEFAULT_SETTINGS, roundDurationMs: UNLIMITED_ROUND_MS });

      // Bien au-delà de la plus longue durée réglable : le joueur doit toujours pouvoir
      // répondre. Sans garde, la manche se serait close dès le premier battement.
      act(() => vi.advanceTimersByTime(120_000));

      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.queryByText(/temps écoulé/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("remplace le décompte par un repère sans limite", () => {
    renderSoloGame({ ...DEFAULT_SETTINGS, roundDurationMs: UNLIMITED_ROUND_MS });
    expect(screen.getByRole("img", { name: "Pas de limite de temps" })).toBeInTheDocument();
  });
});
