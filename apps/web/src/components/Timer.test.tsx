import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timer } from "./Timer.js";

describe("Timer", () => {
  it("arrondit les secondes vers le haut", () => {
    render(<Timer remainingMs={14200} totalMs={15000} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("n'affiche jamais de valeur négative", () => {
    render(<Timer remainingMs={-500} totalMs={15000} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("annonce une seule fois les 5 secondes restantes aux lecteurs d'écran", () => {
    const { rerender } = render(<Timer remainingMs={6000} totalMs={15000} />);
    expect(screen.queryByText("5 secondes restantes")).toBeNull();
    rerender(<Timer remainingMs={5000} totalMs={15000} />);
    const alert = screen.getByText("5 secondes restantes");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    rerender(<Timer remainingMs={1500} totalMs={15000} />);
    expect(screen.queryByText("5 secondes restantes")).toBeNull();
  });

  it("passe en alerte sous 5 secondes puis en danger sous 2 secondes", () => {
    const { rerender, container } = render(<Timer remainingMs={6000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "normal");
    rerender(<Timer remainingMs={5000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "warn");
    rerender(<Timer remainingMs={2000} totalMs={15000} />);
    expect(container.querySelector("[data-state]")).toHaveAttribute("data-state", "danger");
  });
});
