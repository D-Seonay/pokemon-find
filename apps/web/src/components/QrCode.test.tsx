import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrCode } from "./QrCode.js";

describe("QrCode", () => {
  it("s'annonce avec l'adresse qu'il encode, pour rester utile sans être vu", () => {
    render(<QrCode value="https://pokemon.seonay.eu/room/AB23" />);
    expect(
      screen.getByRole("img", { name: "QR code vers https://pokemon.seonay.eu/room/AB23" }),
    ).toBeInTheDocument();
  });

  it("dessine des modules", () => {
    const { container } = render(<QrCode value="https://pokemon.seonay.eu/room/AB23" />);
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(50);
  });

  it("laisse la zone de silence imposée par la spécification", () => {
    const { container } = render(<QrCode value="https://pokemon.seonay.eu/room/AB23" />);
    const svg = container.querySelector("svg");
    const [, , span] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const xs = [...container.querySelectorAll("rect")].map((r) => Number(r.getAttribute("x")));
    // Aucun module ne touche le bord : sans cette marge, un lecteur peine à isoler le code.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...xs)).toBeLessThanOrEqual((span ?? 0) - 4);
  });

  it("produit un code différent pour une room différente", () => {
    const a = render(<QrCode value="https://x.test/room/AAAA" />).container.innerHTML;
    const b = render(<QrCode value="https://x.test/room/BBBB" />).container.innerHTML;
    expect(a).not.toBe(b);
  });
});
