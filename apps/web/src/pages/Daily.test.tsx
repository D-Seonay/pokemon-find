import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYS, writeJson } from "../storage/local.js";
import { Daily } from "./Daily.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function renderDaily() {
  render(
    <MemoryRouter>
      <Daily />
    </MemoryRouter>,
  );
}

describe("Daily", () => {
  it("lance une partie quand le défi du jour n'a pas encore été joué", () => {
    renderDaily();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("affiche le résultat déjà obtenu au lieu de relancer une partie", () => {
    writeJson(KEYS.daily, {
      date: "2026-09-04",
      total: 7842,
      points: [1000, 800, 500, 100, 750, 1000, 450, 20, 200, 900],
    });
    renderDaily();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/7 842/)).toBeInTheDocument();
    expect(screen.getByText("🟦🟩🟨⬛🟩🟦🟨⬛🟧🟩")).toBeInTheDocument();
  });

  it("relance une partie si l'entrée mémorisée date d'un autre jour", () => {
    writeJson(KEYS.daily, { date: "2026-09-03", total: 100, points: [100] });
    renderDaily();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
