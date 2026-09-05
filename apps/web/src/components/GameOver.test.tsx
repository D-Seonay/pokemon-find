import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoloRound } from "../game/useSoloGame.js";
import { GameOver } from "./GameOver.js";

afterEach(() => localStorage.clear());

const rounds: SoloRound[] = [{ targetId: 1, answerId: 1, points: 800, responseTimeMs: 1000 }];

describe("GameOver", () => {
  // React StrictMode double-invoque le rendu (et les effets) en développement. Si l'écriture
  // du meilleur score se produisait pendant le rendu, le second passage relirait la valeur que
  // le premier vient d'écrire et le statut de record dépendrait du nombre de rendus — un bug
  // qui n'apparaît qu'en StrictMode et ressemble à un fluke. Ce test épingle le comportement
  // attendu : un tout premier score doit être annoncé comme record, StrictMode ou non.
  it("annonce un record pour un premier score, y compris en StrictMode", () => {
    render(
      <StrictMode>
        <GameOver rounds={rounds} settings={DEFAULT_SETTINGS} onReplay={vi.fn()} />
      </StrictMode>,
    );
    expect(screen.getByText(/nouveau record/i)).toBeInTheDocument();
  });

  it("le statut de record ne varie pas entre deux rendus identiques", () => {
    const { rerender } = render(
      <StrictMode>
        <GameOver rounds={rounds} settings={DEFAULT_SETTINGS} onReplay={vi.fn()} />
      </StrictMode>,
    );
    const first = screen.queryByText(/nouveau record/i) !== null;

    rerender(
      <StrictMode>
        <GameOver rounds={rounds} settings={DEFAULT_SETTINGS} onReplay={vi.fn()} />
      </StrictMode>,
    );
    const second = screen.queryByText(/nouveau record/i) !== null;

    expect(second).toBe(first);
  });
});
