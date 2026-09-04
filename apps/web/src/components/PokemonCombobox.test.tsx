import { buildPool } from "@pkfind/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PokemonCombobox } from "./PokemonCombobox.js";

const gen1 = buildPool([1]);

function setup() {
  const onSubmit = vi.fn();
  render(<PokemonCombobox pool={gen1} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup(), input: screen.getByRole("combobox") };
}

describe("PokemonCombobox", () => {
  it("n'ouvre aucune liste tant que rien n'est saisi", () => {
    setup();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("filtre dès le premier caractère et plafonne à 8 suggestions", async () => {
    const { user, input } = setup();
    await user.type(input, "a");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(8);
  });

  it("n'expose jamais le numéro national dans les suggestions", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent ?? "").not.toContain("25");
    expect(listbox.textContent ?? "").not.toContain("025");
    expect(listbox.querySelector("[title]")).toBeNull();
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("aria-label")).toBeNull();
    }
  });

  it("garde le bouton de validation désactivé tant que rien n'est sélectionné", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    expect(screen.getByRole("button", { name: /valider/i })).toBeDisabled();
  });

  it("sélectionne à la première Entrée puis valide à la seconde", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "pika");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Pikachu");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 25 }));
  });

  it("navigue au clavier et boucle aux extrémités", async () => {
    const { user, input } = setup();
    await user.type(input, "char");
    const first = screen.getAllByRole("option")[0]!;
    const last = screen.getAllByRole("option").at(-1)!;
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(last).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("auto-sélectionne un nom exact tapé intégralement", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "ho-oh");
    expect(screen.queryByRole("option")).toBeNull(); // Ho-Oh n'est pas en Gén 1
    await user.clear(input);
    await user.type(input, "mewtwo");
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 150 }));
  });

  it("ferme la liste à Échap puis efface la saisie à la seconde pression", async () => {
    const { user, input } = setup();
    await user.type(input, "pika");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("refuse un Pokémon hors pool", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "lucario");
    await user.keyboard("{Enter}{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("se désactive entièrement quand disabled est vrai", () => {
    render(<PokemonCombobox pool={gen1} disabled onSubmit={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /valider/i })).toBeDisabled();
  });
});
