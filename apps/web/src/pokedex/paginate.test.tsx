import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokedexBrowser } from "../components/PokedexBrowser.js";
import { PAGE_SIZE } from "./paginate.js";
import { resetDetailsCache } from "./details.js";

beforeEach(() => {
  resetDetailsCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function cards(): HTMLElement[] {
  return screen.getAllByRole("button", { name: /, voir la fiche$/ });
}

describe("Pokédex — pagination", () => {
  it("n'affiche qu'une page de fiches au lieu des 151 de la génération", () => {
    render(<PokedexBrowser initialGenerations={[1]} />);
    expect(cards()).toHaveLength(PAGE_SIZE);
    // Bulbizarre ouvre la première page, Ronflex (#143) est bien au-delà.
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
    expect(screen.queryByText("Ronflex")).toBeNull();
  });

  it("annonce la page courante et le total", () => {
    render(<PokedexBrowser initialGenerations={[1]} />);
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByText(/Page 1 sur 4/)).toBeInTheDocument();
  });

  it("avance et recule dans les pages", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);

    await user.click(screen.getAllByRole("button", { name: "Page suivante" })[0]!);
    expect(screen.queryByText("Bulbizarre")).toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Page précédente" })[0]!);
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
  });

  it("désactive les commandes aux extrémités", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    expect(screen.getAllByRole("button", { name: "Page précédente" })[0]).toBeDisabled();

    // 151 Pokémon, 48 par page : la quatrième est la dernière.
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getAllByRole("button", { name: "Page suivante" })[0]!);
    }
    expect(screen.getAllByRole("button", { name: "Page suivante" })[0]).toBeDisabled();
  });

  it("revient en première page quand la recherche change", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.click(screen.getAllByRole("button", { name: "Page suivante" })[0]!);

    await user.type(screen.getByRole("searchbox"), "pika");

    // Sans remise à zéro, on resterait sur une page 2 qui n'existe plus pour ce filtre —
    // l'écran paraîtrait vide alors qu'il y a bien un résultat.
    expect(screen.getByText("Pikachu")).toBeInTheDocument();
  });

  it("revient en première page quand le filtre de génération change", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.click(screen.getAllByRole("button", { name: "Page suivante" })[0]!);
    expect(screen.queryByText("Bulbizarre")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /génération 2/i }));

    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
  });

  it("masque la pagination quand tout tient sur une page", async () => {
    const user = userEvent.setup();
    render(<PokedexBrowser initialGenerations={[1]} />);
    await user.type(screen.getByRole("searchbox"), "pika");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});
