import { render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { KEYS } from "../storage/local.js";
import type { SoloHistoryEntry } from "../storage/stats.js";
import { Stats } from "./Stats.js";

afterEach(() => localStorage.clear());

function seed(history: SoloHistoryEntry[]): void {
  localStorage.setItem(KEYS.soloHistory, JSON.stringify(history));
}

function show(): HTMLElement {
  const { container } = render(
    <StrictMode>
      <MemoryRouter>
        <Stats />
      </MemoryRouter>
    </StrictMode>,
  );
  return container;
}

describe("Stats", () => {
  it("invite à jouer quand aucune partie n'a été terminée", () => {
    show();
    expect(screen.getByText(/Aucune partie solo terminée/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jouer une partie" })).toBeInTheDocument();
  });

  it("résume les parties enregistrées", () => {
    seed([
      {
        date: "2026-09-01T10:00:00.000Z",
        rounds: [
          { targetId: 1, gap: 0 },
          { targetId: 4, gap: 10 },
        ],
      },
    ]);
    const container = show();

    // « Écart moyen » est aussi un en-tête de colonne du tableau : on restreint la recherche
    // au bilan global, sinon la requête trouverait deux éléments au même texte.
    const summary = container.querySelector("dl");
    if (!summary) throw new Error("bilan global absent de la page");
    const value = (term: string): string | undefined =>
      within(summary).getByText(term).nextElementSibling?.textContent ?? undefined;

    // Une partie, deux manches répondues, écart moyen 5, une réponse exacte.
    expect(value("Parties")).toBe("1");
    expect(value("Manches répondues")).toBe("2");
    expect(value("Écart moyen")).toBe("5,0");
    expect(value("Réponses exactes")).toBe("1");
  });

  it("détaille chaque génération et signale celles trop peu jouées", () => {
    seed([
      {
        date: "2026-09-01T10:00:00.000Z",
        rounds: [
          { targetId: 1, gap: 1 },
          { targetId: 2, gap: 1 },
          { targetId: 3, gap: 1 },
          { targetId: 4, gap: 1 },
          { targetId: 5, gap: 1 },
          // Héricendre #155, génération 2 : une seule manche, écart énorme.
          { targetId: 155, gap: 900 },
        ],
      },
    ]);
    show();

    const gen2 = screen.getByRole("rowheader", { name: "Génération 2" }).closest("tr");
    expect(gen2?.textContent).toContain("moins de 5 manches");

    const gen1 = screen.getByRole("rowheader", { name: "Génération 1" }).closest("tr");
    expect(gen1?.textContent).not.toContain("moins de");
  });

  it("ne désigne pas une génération sous-échantillonnée comme la plus faible", () => {
    seed([
      {
        date: "2026-09-01T10:00:00.000Z",
        rounds: [
          { targetId: 1, gap: 1 },
          { targetId: 2, gap: 1 },
          { targetId: 3, gap: 1 },
          { targetId: 4, gap: 1 },
          { targetId: 5, gap: 1 },
          { targetId: 155, gap: 900 },
        ],
      },
    ]);
    show();

    // La gén. 2 a le pire écart, mais sur une seule manche : c'est la gén. 1 qui est nommée.
    expect(screen.getByText(/Génération à travailler/).textContent).toContain("Génération 1");
  });

  it("ignore une entrée stockée de forme invalide plutôt que de planter", () => {
    localStorage.setItem(
      KEYS.soloHistory,
      JSON.stringify([{ date: "2026-09-01T10:00:00.000Z", rounds: [{ targetId: "un", gap: 3 }] }]),
    );
    show();
    expect(screen.getByText(/Aucune partie solo terminée/)).toBeInTheDocument();
  });

  it("reste affichable quand le stockage est illisible", () => {
    localStorage.setItem(KEYS.soloHistory, "{ pas du JSON");
    show();
    expect(screen.getByText(/Aucune partie solo terminée/)).toBeInTheDocument();
  });
});
