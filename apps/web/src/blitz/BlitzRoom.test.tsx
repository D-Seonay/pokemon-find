import { DEFAULT_BLITZ_SETTINGS, DEFAULT_SETTINGS, type RoomState } from "@pkfind/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emittedOf, resetFakeSocket, triggerSocketEvent } from "../net/fakeSocket.testkit.js";
import { BLITZ_FLUSH_MS } from "../net/useRoom.js";
import { Room } from "../pages/Room.js";

vi.mock("../net/socket.js", async () => {
  const kit = await import("../net/fakeSocket.testkit.js");
  return { getSocket: kit.getSocket };
});

function player(id: string, nickname: string, score = 0, isHost = false) {
  return { id, nickname, connected: true, isHost, score, hasAnswered: false };
}

function blitzState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCD",
    status: "lobby",
    gameMode: "blitz",
    settings: DEFAULT_SETTINGS,
    blitzSettings: DEFAULT_BLITZ_SETTINGS,
    players: [player("host-1", "Mathéo", 0, true), player("guest-1", "Léa")],
    roundIndex: 0,
    roundCount: 10,
    replayMode: null,
    ...overrides,
  };
}

function renderRoom() {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/room/ABCD"]}>
        <Routes>
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

function settleJoin(state: RoomState, playerId = "host-1"): void {
  act(() => {
    emittedOf("room:join")[0]?.ack?.({
      ok: true,
      data: {
        roomCode: state.code,
        playerId,
        playerToken: "tok-1234",
        nickname: "Mathéo",
        state,
      },
    });
  });
}

function startBlitz(): void {
  act(() => {
    triggerSocketEvent("blitz:start", {
      endsAt: Date.now() + 180_000,
      serverNow: Date.now(),
      found: [],
    });
  });
}

beforeEach(() => {
  resetFakeSocket();
  // Sans ça, la session de reconnexion laissée par le test précédent fait émettre
  // room:rejoin au lieu de room:join, et l'accusé attendu n'existe jamais.
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("Room — blitz : réglage du mode", () => {
  it("laisse l'hôte choisir le contre-la-montre et sa durée", () => {
    renderRoom();
    settleJoin(blitzState({ gameMode: "classic" }));

    fireEvent.click(screen.getByRole("radio", { name: "Contre la montre" }));

    expect(emittedOf("room:mode")[0]?.payload).toEqual({
      mode: "blitz",
      blitz: DEFAULT_BLITZ_SETTINGS,
    });
  });

  it("n'offre le choix du jeu qu'à l'hôte", () => {
    renderRoom();
    settleJoin(blitzState(), "guest-1");
    expect(screen.queryByRole("radio", { name: "Contre la montre" })).toBeNull();
  });
});

describe("Room — blitz : ce que le lobby annonce", () => {
  // Trouvés en jouant une vraie partie à deux : l'invité lisait « Générations : 1 · 15 s ·
  // 10 manches » alors que la room était en contre-la-montre à 3 minutes. Il ignorait à
  // quoi il allait jouer.
  it("annonce le jeu et la durée à l'invité, pas les réglages de l'autre mode", () => {
    renderRoom();
    settleJoin(blitzState(), "guest-1");

    const resume = screen.getByText(/Générations/);
    expect(resume).toHaveTextContent("Contre la montre");
    expect(resume).toHaveTextContent("3 min");
    // Les réglages du mode classique n'ont aucun effet ici : les afficher trompe.
    expect(resume).not.toHaveTextContent("manches");
  });

  it("annonce le mode classique et ses réglages quand c'est lui qui est choisi", () => {
    renderRoom();
    settleJoin(blitzState({ gameMode: "classic" }), "guest-1");

    const resume = screen.getByText(/Générations/);
    expect(resume).toHaveTextContent("Trouver le numéro");
    expect(resume).toHaveTextContent("10 manches");
  });

  // Côté hôte : les réglages de manches restaient réglables alors qu'ils ne servaient à rien.
  it("masque les réglages de manches à l'hôte quand le blitz est choisi", () => {
    renderRoom();
    settleJoin(blitzState());
    expect(screen.queryByRole("radio", { name: "25 s" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "10 manches" })).toBeNull();
  });

  it("les rend à l'hôte dès qu'il revient au mode classique", () => {
    renderRoom();
    settleJoin(blitzState({ gameMode: "classic" }));
    expect(screen.getByRole("radio", { name: "25 s" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "10 manches" })).toBeInTheDocument();
  });
});

describe("Room — blitz : partie en cours", () => {
  it("affiche la grille, le chrono et le classement", () => {
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    startBlitz();

    expect(screen.getByLabelText("Nommer un Pokémon")).toBeInTheDocument();
    expect(screen.getByText("0 / 151")).toBeInTheDocument();
    expect(screen.getByText("Léa")).toBeInTheDocument();
  });

  // Le point qui protège la fonctionnalité : un événement par trouvaille ferait dépasser
  // la limite de débit du serveur (20 / 10 s) et déconnecterait le joueur rapide.
  it("regroupe les trouvailles en un seul envoi au lieu d'un par nom", () => {
    vi.useFakeTimers();
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    startBlitz();

    // `fireEvent` et non `userEvent` : ce dernier attend de vrais délais entre les frappes,
    // ce que les faux timers de ce test figent. Seul compte ici le regroupement des envois.
    const field = screen.getByLabelText("Nommer un Pokémon");
    for (const name of ["bulbizarre", "salameche", "carapuce"]) {
      fireEvent.change(field, { target: { value: name } });
    }

    expect(emittedOf("blitz:submit")).toHaveLength(0); // rien n'est encore parti
    act(() => vi.advanceTimersByTime(BLITZ_FLUSH_MS + 100));

    const sent = emittedOf("blitz:submit");
    expect(sent).toHaveLength(1);
    expect((sent[0]?.payload as { names: string[] }).names).toHaveLength(3);
  });

  it("remplit la case immédiatement, sans attendre le serveur", () => {
    vi.useFakeTimers();
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    startBlitz();

    fireEvent.change(screen.getByLabelText("Nommer un Pokémon"), {
      target: { value: "bulbizarre" },
    });

    // Aucun temps avancé, donc rien n'est même parti sur le réseau : le joueur doit
    // néanmoins voir sa trouvaille. Le tampon de deux secondes rendrait sinon le jeu
    // poussif — on tape, et rien ne bouge.
    expect(screen.getByText("1 / 151")).toBeInTheDocument();
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
    expect(emittedOf("blitz:submit")).toHaveLength(0);
  });

  it("ne perd pas une trouvaille locale quand l'accusé d'un envoi antérieur arrive", () => {
    vi.useFakeTimers();
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    startBlitz();

    const field = screen.getByLabelText("Nommer un Pokémon");
    fireEvent.change(field, { target: { value: "bulbizarre" } });
    act(() => vi.advanceTimersByTime(BLITZ_FLUSH_MS + 100));
    // Trouvé APRÈS l'envoi, donc absent de l'accusé qui va suivre.
    fireEvent.change(field, { target: { value: "salameche" } });
    act(() => {
      emittedOf("blitz:submit")[0]?.ack?.({ ok: true, data: { count: 1, found: [1] } });
    });

    // Remplacer la liste par celle du serveur ferait disparaître Salamèche de l'écran
    // jusqu'au prochain envoi, deux secondes plus tard.
    expect(screen.getByText("2 / 151")).toBeInTheDocument();
    expect(screen.getByText("Salamèche")).toBeInTheDocument();
  });

  it("s'aligne sur la liste renvoyée par le serveur, qui fait foi", () => {
    vi.useFakeTimers();
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    startBlitz();

    fireEvent.change(screen.getByLabelText("Nommer un Pokémon"), {
      target: { value: "bulbizarre" },
    });
    act(() => vi.advanceTimersByTime(BLITZ_FLUSH_MS + 100));
    act(() => {
      emittedOf("blitz:submit")[0]?.ack?.({ ok: true, data: { count: 1, found: [1] } });
    });

    expect(screen.getByText("1 / 151")).toBeInTheDocument();
  });

  it("montre les compteurs des autres, jamais ce qu'ils ont trouvé", () => {
    renderRoom();
    settleJoin(
      blitzState({
        status: "blitz",
        players: [player("host-1", "Mathéo", 3, true), player("guest-1", "Léa", 7)],
      }),
    );
    startBlitz();

    const lea = screen.getByText("Léa").closest("li");
    expect(within(lea as HTMLElement).getByText("7")).toBeInTheDocument();
    // Aucune case de la grille n'est remplie : celles de Léa ne nous regardent pas.
    expect(screen.queryByText("Bulbizarre")).toBeNull();
  });

  it("restaure les trouvailles du joueur après une reconnexion", () => {
    renderRoom();
    settleJoin(blitzState({ status: "blitz" }));
    act(() => {
      triggerSocketEvent("blitz:start", {
        endsAt: Date.now() + 120_000,
        serverNow: Date.now(),
        found: [1, 4, 7],
      });
    });

    expect(screen.getByText("3 / 151")).toBeInTheDocument();
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
  });
});
