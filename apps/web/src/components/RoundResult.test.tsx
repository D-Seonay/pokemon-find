import { buildPool } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SoloRound } from "../game/useSoloGame.js";
import { RoundResult } from "./RoundResult.js";

const gen1 = buildPool([1]);

// Ronflex (#143) attendu, Rhinocorne (#111) joué : écart 32.
const missed: SoloRound = {
  targetId: 143,
  answerId: 111,
  points: 340,
  responseTimeMs: 2400,
};

const timedOut: SoloRound = {
  targetId: 143,
  answerId: null,
  points: 0,
  responseTimeMs: null,
};

describe("RoundResult", () => {
  it("annonce le Pokémon cible avec son nom et son numéro", () => {
    render(<RoundResult round={missed} pool={gen1} />);
    expect(screen.getByText("Ronflex")).toBeInTheDocument();
    expect(screen.getByText("#143")).toBeInTheDocument();
  });

  it("affiche le numéro du Pokémon joué, pas seulement son nom", () => {
    render(<RoundResult round={missed} pool={gen1} />);
    const answer = screen.getByText(/Votre réponse/);
    expect(answer).toHaveTextContent("Rhinocorne");
    expect(answer).toHaveTextContent("#111");
    expect(answer).toHaveTextContent("écart 32");
  });

  it("indique que la réponse était trop basse", () => {
    render(<RoundResult round={missed} pool={gen1} />);
    // Rhinocorne #111 pour une cible #143 : il fallait chercher plus haut.
    expect(screen.getByText(/Votre réponse/)).toHaveTextContent("trop bas");
  });

  it("indique que la réponse était trop haute", () => {
    const tooHigh: SoloRound = { ...missed, answerId: 175 };
    render(<RoundResult round={tooHigh} pool={gen1} />);
    expect(screen.getByText(/Votre réponse/)).toHaveTextContent("trop haut");
  });

  it("ne donne aucune direction pour une réponse exacte", () => {
    const exact: SoloRound = { targetId: 143, answerId: 143, points: 1000, responseTimeMs: 900 };
    render(<RoundResult round={exact} pool={gen1} />);
    const answer = screen.getByText(/Votre réponse/);
    expect(answer).not.toHaveTextContent("trop bas");
    expect(answer).not.toHaveTextContent("trop haut");
  });

  it("affiche les points gagnés", () => {
    render(<RoundResult round={missed} pool={gen1} />);
    expect(screen.getByText("+340")).toBeInTheDocument();
  });

  it("signale un temps écoulé sans inventer de numéro de réponse", () => {
    render(<RoundResult round={timedOut} pool={gen1} />);
    expect(screen.getByText(/temps écoulé/)).toBeInTheDocument();
    expect(screen.queryByText(/Votre réponse/)).toBeNull();
    expect(screen.getByText("+0")).toBeInTheDocument();
  });

  it("passe la révélation au clic et à Entrée quand onSkip est fourni", async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<RoundResult round={missed} pool={gen1} onSkip={onSkip} />);

    await user.click(screen.getByRole("button"));
    expect(onSkip).toHaveBeenCalledTimes(1);

    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("n'affiche aucune invite de passage sans onSkip", () => {
    render(<RoundResult round={missed} pool={gen1} />);
    expect(screen.queryByText(/pour continuer/)).toBeNull();
  });
});
