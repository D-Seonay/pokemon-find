import { pokemonById } from "@pkfind/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PokemonSprite } from "./PokemonSprite.js";

describe("PokemonSprite", () => {
  it("affiche l'image avec le nom français en texte alternatif", () => {
    render(<PokemonSprite pokemon={pokemonById(25)} />);
    const image = screen.getByRole("img", { name: "Pikachu" });
    expect(image).toHaveAttribute("src", pokemonById(25).spriteUrl);
  });

  it("bascule sur une pastille avec l'initiale si l'image échoue", () => {
    render(<PokemonSprite pokemon={pokemonById(25)} />);
    const image = screen.getByRole("img", { name: "Pikachu" });
    fireEvent.error(image);
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("n'expose jamais le numéro national en texte ou en infobulle", () => {
    const { container } = render(<PokemonSprite pokemon={pokemonById(25)} />);
    expect(container.textContent ?? "").not.toContain("25");
    expect(container.querySelector("[title]")).toBeNull();
  });
});
