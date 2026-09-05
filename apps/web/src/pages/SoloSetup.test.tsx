import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SoloSetup } from "./SoloSetup.js";

function renderSetup() {
  render(
    <MemoryRouter initialEntries={["/solo"]}>
      <Routes>
        <Route path="/solo" element={<SoloSetup />} />
        <Route path="/solo/play" element={<p>Partie lancée</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SoloSetup", () => {
  it("propose les trois durées et les trois formats de partie", () => {
    renderSetup();
    expect(screen.getByRole("radio", { name: "10 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "15 s" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "25 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10 manches" })).toBeChecked();
  });

  it("lance la partie", async () => {
    renderSetup();
    await userEvent.click(screen.getByRole("button", { name: /lancer/i }));
    expect(screen.getByText("Partie lancée")).toBeInTheDocument();
  });
});
