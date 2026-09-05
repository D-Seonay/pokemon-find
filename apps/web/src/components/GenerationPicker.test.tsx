import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerationPicker } from "./GenerationPicker.js";

describe("GenerationPicker", () => {
  it("affiche les neuf générations", () => {
    render(<GenerationPicker value={[1]} onChange={vi.fn()} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });

  it("coche celles qui sont sélectionnées", () => {
    render(<GenerationPicker value={[1, 3]} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /génération 1/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /génération 2/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /génération 3/i })).toBeChecked();
  });

  it("ajoute une génération en gardant l'ordre croissant", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[3]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 1/i }));
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it("retire une génération", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1, 3]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 3/i }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("refuse de retirer la dernière génération cochée", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /génération 1/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sélectionne tout d'un clic", async () => {
    const onChange = vi.fn();
    render(<GenerationPicker value={[1]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
