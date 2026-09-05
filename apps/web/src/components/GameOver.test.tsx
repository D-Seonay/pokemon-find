import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SoloRound } from "../game/useSoloGame.js";
import { GameOver } from "./GameOver.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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

  // Le test précédent comparait le texte affiché avant/après un `rerender` — mais avec la
  // version fautive (écriture pendant le rendu), le statut se stabilise dès le premier montage
  // (`saveBest` a déjà écrit ; les deux valeurs comparées valent alors `false`) : ce test-là ne
  // pouvait pas échouer sur la régression qu'il était censé épingler.
  //
  // Espionner `Storage.prototype.setItem` ne marche pas non plus : `saveBest` n'écrit que sur
  // un score strictement supérieur, donc dès que le score courant est déjà enregistré (ce qui
  // est le cas après le tout premier montage, fautif ou non), aucune version n'écrit à nouveau
  // sur un rerender à props identiques — le nombre d'écritures reste plat des deux côtés, ce
  // que j'ai vérifié en le faisant échouer sur la version fautive avant de le corriger.
  //
  // Le vrai point de divergence est la LECTURE, pas l'écriture. `readBest` et `saveBest`
  // appellent chacun `readJson` (donc `Storage.prototype.getItem`) à chaque invocation. La
  // version corrigée ne lit qu'au montage : l'état initial paresseux de `useState` n'est pas
  // ré-exécuté sur un rerender (React ignore l'initialiseur une fois l'état créé), et l'effet
  // ne se redéclenche pas non plus puisque ses dépendances (`settings`, `total`) n'ont pas
  // changé. La version fautive, elle, lit dans le corps du rendu — donc à chaque rendu, y
  // compris un rerender à props identiques.
  it("un second rendu identique ne déclenche pas de lecture supplémentaire du stockage", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const { rerender } = render(
      <StrictMode>
        <GameOver rounds={rounds} settings={DEFAULT_SETTINGS} onReplay={vi.fn()} />
      </StrictMode>,
    );
    const callsAfterMount = getItemSpy.mock.calls.length;

    rerender(
      <StrictMode>
        <GameOver rounds={rounds} settings={DEFAULT_SETTINGS} onReplay={vi.fn()} />
      </StrictMode>,
    );

    expect(getItemSpy.mock.calls.length).toBe(callsAfterMount);
  });
});
