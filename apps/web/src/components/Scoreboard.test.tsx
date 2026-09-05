import type { Standing } from "@pkfind/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Scoreboard } from "./Scoreboard.js";

const standings: Standing[] = [
  { rank: 1, playerId: "a", nickname: "Mathéo", score: 4200, totalResponseTimeMs: 30_000 },
  { rank: 2, playerId: "b", nickname: "Léa", score: 3100, totalResponseTimeMs: 41_000 },
  { rank: 2, playerId: "c", nickname: "Tom", score: 3100, totalResponseTimeMs: 41_000 },
];

describe("Scoreboard", () => {
  it("affiche les joueurs dans l'ordre du classement", () => {
    render(<Scoreboard standings={standings} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Mathéo")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Tom")).toBeInTheDocument();
  });

  it("affiche le même rang pour deux joueurs à égalité", () => {
    render(<Scoreboard standings={standings} />);
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("met en évidence le joueur courant", () => {
    render(<Scoreboard standings={standings} highlightPlayerId="b" />);
    expect(screen.getByText("Léa").closest("tr")).toHaveAttribute("data-self", "true");
  });
});
