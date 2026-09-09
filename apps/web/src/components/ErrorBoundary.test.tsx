import { buildPool } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoundResult } from "./RoundResult.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

// React logue systématiquement (via `console.error`) toute exception attrapée par un
// ErrorBoundary, même quand elle est bien récupérée — c'est le comportement de React
// lui-même, pas quelque chose que ce projet ajoute. On le neutralise ici pour ne garder que
// le signal des assertions, sans jamais faire logguer quoi que ce soit à ErrorBoundary elle-même
// (contrainte du projet : pas de `console.log` dans le filet).
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("ErrorBoundary", () => {
  it("affiche le message de repli au lieu de l'arbre vide quand un enfant lève pendant le rendu", () => {
    // Reproduit le défaut exact décrit par l'issue #8, pas une exception synthétique : un
    // `targetId` hors dataset donné à `RoundResult`, qui appelle `pokemonById` (la variante
    // qui lève, pas `tryPokemonById`) directement pendant son rendu.
    const pool = buildPool([1]);
    render(
      <ErrorBoundary resetKey="/solo/play" fallback={<p>Message de repli</p>}>
        <RoundResult
          round={{ targetId: 999999, answerId: null, points: 0, responseTimeMs: null }}
          pool={pool}
        />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Message de repli")).toBeInTheDocument();
    // Preuve que c'est bien le repli qui s'affiche, pas un fragment du rendu de RoundResult :
    // son contenu propre («Pas de réponse») ne doit apparaître nulle part.
    expect(screen.queryByText(/Pas de réponse/)).toBeNull();
  });

  it("continue d'afficher les enfants tant qu'aucune exception ne survient", () => {
    render(
      <ErrorBoundary resetKey="/pokedex" fallback={<p>Message de repli</p>}>
        <p>Contenu normal</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Contenu normal")).toBeInTheDocument();
    expect(screen.queryByText("Message de repli")).toBeNull();
  });

  it("revient aux enfants quand resetKey change après une erreur, plutôt que de rester figée sur le repli", () => {
    const pool = buildPool([1]);
    const { rerender } = render(
      <ErrorBoundary resetKey="/solo/play" fallback={<p>Message de repli</p>}>
        <RoundResult
          round={{ targetId: 999999, answerId: null, points: 0, responseTimeMs: null }}
          pool={pool}
        />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Message de repli")).toBeInTheDocument();

    // Simule ce que fait App au changement de route : une nouvelle valeur de resetKey (le
    // pathname) accompagnée d'enfants sains pour la nouvelle page.
    rerender(
      <ErrorBoundary resetKey="/pokedex" fallback={<p>Message de repli</p>}>
        <p>Nouvelle page saine</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Nouvelle page saine")).toBeInTheDocument();
    expect(screen.queryByText("Message de repli")).toBeNull();
  });
});
