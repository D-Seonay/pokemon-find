import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SoloGame } from "./SoloGame.js";

function renderSoloGame() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/solo/play", state: DEFAULT_SETTINGS }]}>
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
