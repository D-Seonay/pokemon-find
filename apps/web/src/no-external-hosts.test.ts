import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Le jeu doit rester jouable sur un réseau qui filtre les domaines tiers, et l'adresse IP
 * des joueurs n'a pas à partir chez un tiers à chaque chargement. Les sprites (b1457eb)
 * puis les polices (#7) ont été rapatriés pour ça ; ce test évite qu'une future
 * dépendance ne les réintroduise en silence, ce qui ne se verrait sur aucun écran.
 */
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const SOURCES = [
  ["index.html", "../index.html"],
  ["styles/tokens.css", "./styles/tokens.css"],
] as const;

describe("aucun hôte externe dans le front", () => {
  for (const [label, path] of SOURCES) {
    it(`${label} ne référence aucun domaine distant`, () => {
      const found = [...read(path).matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
      expect(found).toEqual([]);
    });
  }

  it("index.html ne préconnecte plus à aucun tiers", () => {
    expect(read("../index.html")).not.toContain("preconnect");
  });

  it("les polices sont servies par un chemin local", () => {
    const css = read("./styles/tokens.css");
    expect(css).toContain('src: url("/fonts/');
    // Les plages Unicode doivent survivre : sans elles, le navigateur télécharge tous les
    // sous-ensembles au lieu du seul dont la page a besoin.
    expect(css).toContain("unicode-range:");
  });
});
