import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { KEYS } from "../storage/local.js";
import { JoinRoom } from "./JoinRoom.js";

afterEach(() => localStorage.clear());

function renderJoinRoom(): void {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/join"]}>
        <Routes>
          <Route path="/join" element={<JoinRoom />} />
          <Route path="/room/:code" element={<p>Room : {"{code}"}</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

// Petit gabarit local : n'importe quelle route "/room/XXXX" affiche son code, sans
// dépendre du composant `Room` réel (qui ouvrirait une connexion socket hors-sujet ici).
function renderJoinRoomWithRoomSentinel(): void {
  render(
    <MemoryRouter initialEntries={["/join"]}>
      <Routes>
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/room/:code" element={<RoomSentinel />} />
      </Routes>
    </MemoryRouter>,
  );
}

function RoomSentinel() {
  return <p>Route de room atteinte</p>;
}

describe("JoinRoom", () => {
  it("désactive le bouton tant que le code n'a pas 4 caractères", async () => {
    const user = userEvent.setup();
    renderJoinRoom();

    const button = screen.getByRole("button", { name: "Rejoindre" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Code de la room"), "AB");
    expect(button).toBeDisabled();
  });

  it("désactive le bouton tant que le pseudo fait moins de 2 caractères, même avec un code complet", async () => {
    const user = userEvent.setup();
    renderJoinRoom();

    await user.type(screen.getByLabelText("Code de la room"), "ABCD");
    expect(screen.getByRole("button", { name: "Rejoindre" })).toBeDisabled();

    await user.type(screen.getByLabelText("Ton pseudo"), "A");
    expect(screen.getByRole("button", { name: "Rejoindre" })).toBeDisabled();
  });

  it("met le code en majuscules au fur et à mesure de la saisie", async () => {
    const user = userEvent.setup();
    renderJoinRoom();

    await user.type(screen.getByLabelText("Code de la room"), "abcd");

    expect(screen.getByLabelText("Code de la room")).toHaveValue("ABCD");
  });

  it("active le bouton une fois un code de 4 caractères et un pseudo valides saisis", async () => {
    const user = userEvent.setup();
    renderJoinRoom();

    await user.type(screen.getByLabelText("Code de la room"), "abcd");
    await user.type(screen.getByLabelText("Ton pseudo"), "Sacha");

    expect(screen.getByRole("button", { name: "Rejoindre" })).toBeEnabled();
  });

  it("navigue vers /room/<code> (en majuscules) au clic", async () => {
    const user = userEvent.setup();
    renderJoinRoomWithRoomSentinel();

    await user.type(screen.getByLabelText("Code de la room"), "abcd");
    await user.type(screen.getByLabelText("Ton pseudo"), "Sacha");
    await user.click(screen.getByRole("button", { name: "Rejoindre" }));

    expect(screen.getByText("Route de room atteinte")).toBeInTheDocument();
  });

  it("enregistre le pseudo (sans espaces superflus) dans le stockage local au clic", async () => {
    const user = userEvent.setup();
    renderJoinRoomWithRoomSentinel();

    await user.type(screen.getByLabelText("Code de la room"), "abcd");
    await user.type(screen.getByLabelText("Ton pseudo"), "  Sacha  ");
    await user.click(screen.getByRole("button", { name: "Rejoindre" }));

    expect(localStorage.getItem(KEYS.nickname)).toBe(JSON.stringify("Sacha"));
  });

  it("reprend le pseudo précédemment enregistré", () => {
    localStorage.setItem(KEYS.nickname, JSON.stringify("Ondine"));
    renderJoinRoom();

    expect(screen.getByLabelText("Ton pseudo")).toHaveValue("Ondine");
  });

  it("ne considère pas un pseudo composé uniquement d'espaces comme valide", async () => {
    const user = userEvent.setup();
    renderJoinRoom();

    await user.type(screen.getByLabelText("Code de la room"), "abcd");
    await user.type(screen.getByLabelText("Ton pseudo"), "  ");

    expect(screen.getByRole("button", { name: "Rejoindre" })).toBeDisabled();
  });
});
