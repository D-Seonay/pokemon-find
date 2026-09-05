import { type RoundResult, pokemonById } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MultiReveal } from "./MultiReveal.js";

const results: RoundResult[] = [
  { playerId: "a", nickname: "Mathéo", pokemonId: 143, gap: 0, points: 1000, responseTimeMs: 2400 },
  { playerId: "b", nickname: "Léa", pokemonId: 111, gap: 32, points: 340, responseTimeMs: 5100 },
  { playerId: "c", nickname: "Tom", pokemonId: null, gap: null, points: 0, responseTimeMs: null },
];

describe("MultiReveal", () => {
  it("annonce le Pokémon cible avec son numéro", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    expect(screen.getByText("Ronflex")).toBeInTheDocument();
    expect(screen.getByText("#143")).toBeInTheDocument();
  });

  it("affiche la réponse, l'écart et les points de chaque joueur", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    expect(screen.getByText("Rhinocorne")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("340")).toBeInTheDocument();
  });

  it("marque explicitement une absence de réponse", () => {
    render(<MultiReveal target={pokemonById(143)} results={results} maxId={151} />);
    const row = screen.getByText("Tom").closest("tr");
    expect(row?.textContent).toContain("—");
  });
});
