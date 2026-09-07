import type { Ack, JoinPayload, PlayerPublic, RoomState } from "@pkfind/shared";
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emittedOf, resetFakeSocket, triggerSocketEvent } from "../net/fakeSocket.testkit.js";
import { Room } from "./Room.js";

// Même choix de seam que useRoom.test.tsx : le module `socket.js` est intégralement
// remplacé par le double de `fakeSocket.testkit.ts`, jamais par un vrai `socket.io-client`.
vi.mock("../net/socket.js", async () => {
  const kit = await import("../net/fakeSocket.testkit.js");
  return { getSocket: kit.getSocket };
});

function host(overrides: Partial<PlayerPublic> = {}): PlayerPublic {
  return {
    id: "host-1",
    nickname: "Mathéo",
    connected: true,
    isHost: true,
    score: 0,
    hasAnswered: false,
    ...overrides,
  };
}

function guest(overrides: Partial<PlayerPublic> = {}): PlayerPublic {
  return {
    id: "guest-1",
    nickname: "Léa",
    connected: true,
    isHost: false,
    score: 0,
    hasAnswered: false,
    ...overrides,
  };
}

function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCD",
    status: "lobby",
    settings: DEFAULT_SETTINGS,
    players: [host()],
    roundIndex: 0,
    roundCount: DEFAULT_SETTINGS.roundCount,
    replayMode: null,
    ...overrides,
  };
}

function renderRoom(options: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={["/room/ABCD"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>
  );
  return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Fait aboutir la toute première jointure (room:join) avec l'état donné. */
function settleJoin(state: RoomState, playerId = "host-1"): void {
  const join = emittedOf("room:join")[0];
  const payload: JoinPayload = {
    roomCode: state.code,
    playerId,
    playerToken: "tok-1234",
    nickname: "Mathéo",
    state,
  };
  act(() => {
    join?.ack?.({ ok: true, data: payload } satisfies Ack<JoinPayload>);
  });
}

beforeEach(() => {
  resetFakeSocket();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Room — écrans de base", () => {
  it("affiche un écran de connexion tant que l'état n'est pas arrivé", () => {
    renderRoom();
    expect(screen.getByText("Connexion…")).toBeInTheDocument();
  });

  it("affiche une erreur fatale quand la jointure est refusée", () => {
    renderRoom();
    const join = emittedOf("room:join")[0];
    act(() => {
      join?.ack?.({
        ok: false,
        code: "ROOM_NOT_FOUND",
        message: "Cette room n'existe pas ou plus.",
      });
    });
    expect(screen.getByText("Cette room n'existe pas ou plus.")).toBeInTheDocument();
  });

  it("affiche l'écran de fermeture reçu du serveur", () => {
    renderRoom();
    settleJoin(makeState());
    act(() => triggerSocketEvent("room:closed", { reason: "empty" }));
    expect(screen.getByText(/room a été fermée \(empty\)/)).toBeInTheDocument();
  });

  it("affiche le bandeau de reconnexion pendant une coupure transport", () => {
    renderRoom();
    settleJoin(makeState());
    act(() => triggerSocketEvent("disconnect", "transport close"));
    expect(screen.getByRole("status")).toHaveTextContent("Reconnexion…");
  });
});

describe("Room — lobby", () => {
  it("affiche le code de room et désactive Démarrer avec un seul joueur", () => {
    renderRoom();
    settleJoin(makeState({ players: [host()] }));
    expect(screen.getByText("ABCD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeDisabled();
    expect(screen.getByText(/au moins 2 joueurs connectés/)).toBeInTheDocument();
  });

  it("active Démarrer dès que 2 joueurs sont connectés", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeEnabled();
  });

  it("affiche les réglages en lecture seule pour un invité", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }), "guest-1");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/Générations : 1 ·/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Démarrer" })).toBeNull();
  });

  it("émet room:start au clic de l'hôte et affiche l'erreur d'action renvoyée", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));
    const start = emittedOf("room:start")[0];
    act(() =>
      start?.ack?.({
        ok: false,
        code: "NOT_ENOUGH_PLAYERS",
        message: "Il faut au moins 2 joueurs connectés pour démarrer.",
      }),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Il faut au moins 2 joueurs connectés pour démarrer.");
    fireEvent.click(within(alert).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Room — régression : composition des clics de générations sous debounce", () => {
  beforeEach(() => vi.useFakeTimers());

  it("compose deux clics rapprochés au lieu de perdre le premier", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, generations: [1] } }));

    fireEvent.click(screen.getByRole("checkbox", { name: /génération 2/i }));
    act(() => vi.advanceTimersByTime(100)); // < SETTINGS_DEBOUNCE_MS : le débat n'a pas fini
    fireEvent.click(screen.getByRole("checkbox", { name: /génération 3/i }));
    act(() => vi.advanceTimersByTime(250));

    const settingsCalls = emittedOf("room:settings");
    expect(settingsCalls).toHaveLength(1);
    expect(settingsCalls[0]?.payload).toEqual({
      settings: { ...DEFAULT_SETTINGS, generations: [1, 2, 3] },
    });
  });
});

describe("Room — déroulement d'une manche", () => {
  it("affiche la manche en cours et envoie round:answer à la validation", async () => {
    const user = userEvent.setup();
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 2,
        roundCount: 10,
        targetId: 25,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    expect(screen.getByText("Manche 3 / 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Numéro cible 25")).toBeInTheDocument();

    const input = screen.getByRole("combobox");
    await user.type(input, "pika");
    await user.keyboard("{Enter}{Enter}");

    const answer = emittedOf("round:answer")[0];
    expect(answer?.payload).toEqual({ roundIndex: 2, pokemonId: 25 });
  });

  it("affiche la révélation puis le classement final", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));

    act(() => {
      triggerSocketEvent("round:reveal", {
        roundIndex: 0,
        target: {
          id: 25,
          nameFr: "Pikachu",
          nameEn: "Pikachu",
          slugFr: "pikachu",
          slugEn: "pikachu",
          generation: 1,
          spriteUrl: "https://example.test/25.png",
        },
        results: [
          {
            playerId: "host-1",
            nickname: "Mathéo",
            pokemonId: 25,
            gap: 0,
            points: 1000,
            responseTimeMs: 1200,
          },
        ],
        standings: [
          {
            rank: 1,
            playerId: "host-1",
            nickname: "Mathéo",
            score: 1000,
            totalResponseTimeMs: 1200,
          },
        ],
        revealEndsAt: Date.now() + 6000,
        serverNow: Date.now(),
      });
    });
    expect(screen.getByText("Pikachu")).toBeInTheDocument();
    expect(screen.getByText("Trouvé !")).toBeInTheDocument();

    act(() => {
      triggerSocketEvent("game:end", {
        standings: [
          {
            rank: 1,
            playerId: "host-1",
            nickname: "Mathéo",
            score: 1000,
            totalResponseTimeMs: 1200,
          },
        ],
        history: [],
      });
    });
    expect(screen.getByText("Classement final")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nouvelle partie" }));
    const playAgain = emittedOf("room:playAgain")[0];
    expect(playAgain?.payload).toEqual({ sameSeries: false });
  });

  it("déplace le focus sur le panneau de révélation à l'arrivée de round:reveal", () => {
    const { container } = renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));

    act(() => {
      triggerSocketEvent("round:reveal", {
        roundIndex: 0,
        target: {
          id: 25,
          nameFr: "Pikachu",
          nameEn: "Pikachu",
          slugFr: "pikachu",
          slugEn: "pikachu",
          generation: 1,
          spriteUrl: "https://example.test/25.png",
        },
        results: [
          {
            playerId: "host-1",
            nickname: "Mathéo",
            pokemonId: 25,
            gap: 0,
            points: 1000,
            responseTimeMs: 1200,
          },
        ],
        standings: [
          {
            rank: 1,
            playerId: "host-1",
            nickname: "Mathéo",
            score: 1000,
            totalResponseTimeMs: 1200,
          },
        ],
        revealEndsAt: Date.now() + 6000,
        serverNow: Date.now(),
      });
    });

    expect(document.activeElement).toBe(container.querySelector("section"));
  });
});

describe("Room — rendu sous StrictMode (comme en développement réel)", () => {
  it("ne rejoue la jointure qu'une fois et affiche correctement le lobby", () => {
    renderRoom({ strict: true });
    expect(emittedOf("room:join")).toHaveLength(1);
    settleJoin(makeState({ players: [host(), guest()] }));
    expect(screen.getByText("ABCD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeEnabled();
  });
});
