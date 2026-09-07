import type { Ack, JoinPayload, RoomState } from "@pkfind/shared";
import { DEFAULT_SETTINGS } from "@pkfind/shared";
import { act, render, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emittedOf,
  getConnectCallCount,
  resetFakeSocket,
  setSocketConnected,
  triggerSocketEvent,
} from "./fakeSocket.testkit.js";
import { useRoom } from "./useRoom.js";

// `getSocket()` est entièrement remplacé par le double de `fakeSocket.testkit.ts` : aucun
// vrai `socket.io-client` n'est instancié dans ce fichier. Voir la justification du choix
// (mock de module plutôt que serveur Socket.IO réel) dans le rapport de la tâche.
vi.mock("./socket.js", async () => {
  const kit = await import("./fakeSocket.testkit.js");
  return { getSocket: kit.getSocket };
});

type UseRoomInput = Parameters<typeof useRoom>[0];

function baseInput(overrides: Partial<UseRoomInput> = {}): UseRoomInput {
  return {
    code: "ABCD",
    nickname: "Mathéo",
    create: false,
    onCreated: vi.fn(),
    ...overrides,
  };
}

function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "ABCD",
    status: "lobby",
    settings: DEFAULT_SETTINGS,
    players: [
      {
        id: "host-1",
        nickname: "Mathéo",
        connected: true,
        isHost: true,
        score: 0,
        hasAnswered: false,
      },
    ],
    roundIndex: 0,
    roundCount: DEFAULT_SETTINGS.roundCount,
    replayMode: null,
    ...overrides,
  };
}

function joinPayload(overrides: Partial<JoinPayload> = {}): JoinPayload {
  return {
    roomCode: "ABCD",
    playerId: "host-1",
    playerToken: "tok-1234",
    nickname: "Mathéo",
    state: makeState(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetFakeSocket();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRoom — jointure", () => {
  it("rejoint une room existante et expose l'état renvoyé par le serveur", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    const join = emittedOf("room:join")[0];
    expect(join?.payload).toEqual({ roomCode: "ABCD", nickname: "Mathéo" });

    const payload = joinPayload();
    act(() => {
      join?.ack?.({ ok: true, data: payload } satisfies Ack<JoinPayload>);
    });

    expect(result.current.state).toEqual(payload.state);
    expect(result.current.playerId).toBe("host-1");
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("passe en erreur fatale quand la jointure est refusée", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    const join = emittedOf("room:join")[0];
    act(() => {
      join?.ack?.({
        ok: false,
        code: "ROOM_NOT_FOUND",
        message: "Cette room n'existe pas ou plus.",
      });
    });
    expect(result.current.error).toBe("Cette room n'existe pas ou plus.");
    expect(result.current.state).toBeNull();
  });

  it("crée une room et notifie le code réellement obtenu", () => {
    const onCreated = vi.fn();
    renderHook(() => useRoom(baseInput({ create: true, code: "new", onCreated })));
    const create = emittedOf("room:create")[0];
    const payload = joinPayload({ roomCode: "WXYZ", state: makeState({ code: "WXYZ" }) });
    act(() => {
      create?.ack?.({ ok: true, data: payload });
    });
    expect(onCreated).toHaveBeenCalledWith("WXYZ");
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

describe("useRoom — événements de partie", () => {
  it("calcule l'échéance locale d'une manche à partir de l'horodatage serveur", () => {
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 25,
        endsAt: 1_015_000,
        serverNow: 1_000_000,
      });
    });
    expect(result.current.round).toEqual({
      roundIndex: 0,
      roundCount: 10,
      targetId: 25,
      localEndsAt: 1_015_000,
    });
  });

  it("passe de la manche à la révélation puis à la fin de partie", () => {
    vi.setSystemTime(1_000_000);
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 1,
        targetId: 25,
        endsAt: 1_015_000,
        serverNow: 1_000_000,
      });
    });
    expect(result.current.round).not.toBeNull();

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
        results: [],
        standings: [],
        revealEndsAt: 1_021_000,
        serverNow: 1_000_000,
      });
    });
    expect(result.current.round).toBeNull();
    expect(result.current.reveal?.localEndsAt).toBe(1_021_000);

    act(() => {
      triggerSocketEvent("game:end", { standings: [], history: [] });
    });
    expect(result.current.reveal).not.toBeNull(); // game:end ne touche pas reveal…
    expect(result.current.final).toEqual({ standings: [], history: [] });
    expect(result.current.round).toBeNull();
  });

  it("efface le classement final dès qu'un état non-terminé est diffusé", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => triggerSocketEvent("game:end", { standings: [], history: [] }));
    expect(result.current.final).not.toBeNull();
    act(() => triggerSocketEvent("room:state", makeState({ status: "lobby" })));
    expect(result.current.final).toBeNull();
  });

  it("mémorise la raison de fermeture de la room", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => triggerSocketEvent("room:closed", { reason: "expired" }));
    expect(result.current.closed).toBe("expired");
  });
});

describe("useRoom — actions et erreurs passagères", () => {
  it("expose l'erreur d'une action ratée puis permet de la fermer", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => result.current.actions.start());
    const call = emittedOf("room:start")[0];
    act(() => {
      call?.ack?.({ ok: false, code: "NOT_HOST", message: "Seul l'hôte peut faire ça." });
    });
    expect(result.current.actionError).toBe("Seul l'hôte peut faire ça.");
    act(() => result.current.actions.dismissActionError());
    expect(result.current.actionError).toBeNull();
  });

  it("n'émet rien si on répond hors manche", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => result.current.actions.answer(25));
    expect(emittedOf("round:answer")).toHaveLength(0);
  });

  it("relance connect() sur une déconnexion forcée par le serveur, jamais sur une coupure transport", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => triggerSocketEvent("disconnect", "transport close"));
    expect(result.current.reconnecting).toBe(true);
    expect(getConnectCallCount()).toBe(0);

    act(() => triggerSocketEvent("disconnect", "io server disconnect"));
    expect(getConnectCallCount()).toBe(1);
  });

  it("efface l'indicateur de reconnexion dès que la socket revient", () => {
    // La moitié qui manquait : rien ne vérifiait que `reconnecting` redescend. Un refactor
    // qui oublierait `setReconnecting(false)` laisserait la bannière « Reconnexion… » à vie
    // par-dessus une partie qui tourne, sans qu'aucun test ne bronche.
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => triggerSocketEvent("disconnect", "transport close"));
    expect(result.current.reconnecting).toBe(true);

    act(() => triggerSocketEvent("connect"));
    expect(result.current.reconnecting).toBe(false);
  });
});

describe("useRoom — régression : debounce de room:settings", () => {
  it("ne débat qu'une seule écriture réseau pour deux réglages rapprochés", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    act(() => result.current.actions.setSettings({ ...DEFAULT_SETTINGS, roundCount: 5 }));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.actions.setSettings({ ...DEFAULT_SETTINGS, roundCount: 15 }));
    act(() => vi.advanceTimersByTime(250));

    const calls = emittedOf("room:settings");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toEqual({ settings: { ...DEFAULT_SETTINGS, roundCount: 15 } });
  });

  it("n'appelle onSettled que pour l'écriture qui aboutit réellement", () => {
    const { result } = renderHook(() => useRoom(baseInput()));
    const settledFirst = vi.fn();
    const settledSecond = vi.fn();
    act(() =>
      result.current.actions.setSettings({ ...DEFAULT_SETTINGS, roundCount: 5 }, settledFirst),
    );
    act(() =>
      result.current.actions.setSettings({ ...DEFAULT_SETTINGS, roundCount: 15 }, settledSecond),
    );
    act(() => vi.advanceTimersByTime(250));

    const ack: Ack<{ state: RoomState }> = { ok: true, data: { state: makeState() } };
    act(() => emittedOf("room:settings")[0]?.ack?.(ack));

    expect(settledFirst).not.toHaveBeenCalled();
    expect(settledSecond).toHaveBeenCalledTimes(1);
    expect(settledSecond).toHaveBeenCalledWith(ack);
  });
});

describe("useRoom — régression : connect ne doit pas dupliquer la jointure", () => {
  it("ignore le tout premier connect et ne rejoue room:rejoin qu'à une vraie reconnexion", () => {
    setSocketConnected(false);
    const { result } = renderHook(() => useRoom(baseInput()));

    const join = emittedOf("room:join")[0];
    act(() => {
      join?.ack?.({ ok: true, data: joinPayload() });
    });
    expect(emittedOf("room:join")).toHaveLength(1);

    // Première connexion réelle du transport : ne doit rejouer ni room:join ni room:rejoin,
    // sous peine de produire un siège fantôme (régression #2 du brief).
    act(() => triggerSocketEvent("connect"));
    expect(emittedOf("room:join")).toHaveLength(1);
    expect(emittedOf("room:rejoin")).toHaveLength(0);
    expect(result.current.error).toBeNull();

    // Une vraie reconnexion transport ultérieure doit, elle, rejouer la session.
    act(() => triggerSocketEvent("connect"));
    expect(emittedOf("room:rejoin")).toHaveLength(1);
  });
});

describe("useRoom — régression : room:leave sous StrictMode", () => {
  // Important : `renderHook` de @testing-library/react ne reproduit PAS le double montage
  // StrictMode dans cette version (16.x + React 19) — vérifié empiriquement avec un effet
  // sonde trivial, qui n'y voit qu'un seul setup au lieu de setup/cleanup/setup. Seul
  // `render()` sur un vrai arbre de composants le déclenche, comme le fait réellement
  // `ReactDOM.createRoot(...).render(<StrictMode>…)` dans `main.tsx`. D'où ce composant-sonde
  // plutôt qu'un `renderHook` — c'est le seul des deux qui peut voir la régression.
  function Harness() {
    useRoom(baseInput());
    return null;
  }

  it("ne quitte pas la room lors du double montage synchrone de StrictMode, mais le fait à un vrai démontage", () => {
    const { unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    // Le double montage StrictMode (cleanup + remount synchrones) a déjà eu lieu à ce stade,
    // de façon synchrone, avant même que `render` ne rende la main.
    expect(emittedOf("room:join")).toHaveLength(1);
    expect(emittedOf("room:leave")).toHaveLength(0);
    act(() => vi.advanceTimersByTime(50));
    expect(emittedOf("room:leave")).toHaveLength(0);

    unmount();
    act(() => vi.advanceTimersByTime(50));
    expect(emittedOf("room:leave")).toHaveLength(1);
  });
});
