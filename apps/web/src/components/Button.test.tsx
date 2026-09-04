import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button.js";

describe("Button", () => {
  it("a pour type par défaut « button » afin d'éviter une soumission de formulaire accidentelle", () => {
    render(<Button>Valider</Button>);
    expect(screen.getByRole("button", { name: "Valider" })).toHaveAttribute("type", "button");
  });

  it("laisse un type explicite l'emporter sur la valeur par défaut", () => {
    render(<Button type="submit">Envoyer</Button>);
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveAttribute("type", "submit");
  });
});
