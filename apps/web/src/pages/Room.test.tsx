import type { Ack, JoinPayload, PlayerPublic, RoomState } from "@pkfind/shared";
import { DEFAULT_BLITZ_SETTINGS, DEFAULT_SETTINGS, pokemonById } from "@pkfind/shared";
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
    gameMode: "classic",
    settings: DEFAULT_SETTINGS,
    blitzSettings: DEFAULT_BLITZ_SETTINGS,
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
    fireEvent.click(within(alert).getByRole("button", { name: "Fermer le message" }));
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

describe("Room — réglages de durée et de nombre de manches par l'hôte", () => {
  beforeEach(() => vi.useFakeTimers());

  it("permet à l'hôte de changer le temps par manche", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, roundDurationMs: 15000 } }));

    fireEvent.click(screen.getByRole("radio", { name: "25 s" }));
    act(() => vi.advanceTimersByTime(250));

    expect(emittedOf("room:settings")[0]?.payload).toEqual({
      settings: { ...DEFAULT_SETTINGS, roundDurationMs: 25000 },
    });
  });

  it("permet à l'hôte de changer le nombre de manches", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, roundCount: 10 } }));

    fireEvent.click(screen.getByRole("radio", { name: "5 manches" }));
    act(() => vi.advanceTimersByTime(250));

    expect(emittedOf("room:settings")[0]?.payload).toEqual({
      settings: { ...DEFAULT_SETTINGS, roundCount: 5 },
    });
  });

  it("n'offre aucun réglage à un invité, qui les voit en lecture seule", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }), "guest-1");

    expect(screen.queryByRole("radio", { name: "25 s" })).toBeNull();
    expect(screen.getByText(/Générations : 1 ·/)).toBeInTheDocument();
  });

  // Le piège que la généralisation de l'état optimiste doit fermer : avant l'accusé de
  // réception du serveur, `state.settings` porte encore l'ancienne valeur. Composer le
  // second changement à partir de lui annulerait silencieusement le premier.
  it("ne perd pas la durée quand les générations changent juste après", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, roundDurationMs: 15000 } }));

    fireEvent.click(screen.getByRole("radio", { name: "25 s" }));
    act(() => vi.advanceTimersByTime(100)); // le débounce n'a pas encore écrit
    fireEvent.click(screen.getByRole("checkbox", { name: /génération 2/i }));
    act(() => vi.advanceTimersByTime(250));

    const calls = emittedOf("room:settings");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toEqual({
      settings: { ...DEFAULT_SETTINGS, roundDurationMs: 25000, generations: [1, 2] },
    });
  });

  it("affiche le réglage choisi sans attendre la confirmation du serveur", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, roundCount: 10 } }));

    fireEvent.click(screen.getByRole("radio", { name: "15 manches" }));
    // Aucun temps avancé : le serveur n'a rien confirmé, l'affichage doit déjà suivre.
    expect(screen.getByRole("radio", { name: "15 manches" })).toBeChecked();
  });
});

describe("Room — régression : rejouer après une partie terminée", () => {
  // Signalé en production : « le rejouer ne fonctionne pas, je suis toujours obligé
  // d'actualiser ». `game:end` remettait `round` à zéro mais laissait la révélation de
  // la dernière manche en mémoire. Le classement final passait devant, donc rien ne se
  // voyait — jusqu'au clic sur Rejouer, qui l'effaçait et faisait retomber l'écran sur
  // cette révélation périmée.
  function playUntilEnd(): void {
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:reveal", {
        roundIndex: 9,
        target: pokemonById(143),
        results: [],
        standings: [],
        revealEndsAt: Date.now() + 6000,
        serverNow: Date.now(),
      });
    });
    act(() => {
      triggerSocketEvent("game:end", { standings: [], history: [] });
    });
  }

  it("revient au lobby au lieu de rester sur la dernière révélation", () => {
    renderRoom();
    playUntilEnd();
    expect(screen.getByText("Classement final")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nouvelle partie" }));
    act(() => {
      emittedOf("room:playAgain")[0]?.ack?.({ ok: true, data: null });
      triggerSocketEvent("room:state", makeState({ players: [host(), guest()] }));
    });

    expect(screen.getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
    expect(screen.queryByText("Ronflex")).toBeNull();
  });

  it("abandonne une révélation périmée si la room est revenue au lobby sans nous", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:reveal", {
        roundIndex: 0,
        target: pokemonById(143),
        results: [],
        standings: [],
        revealEndsAt: Date.now() + 6000,
        serverNow: Date.now(),
      });
    });
    expect(screen.getByText("Ronflex")).toBeInTheDocument();

    // Sans game:end : le cas d'une coupure pendant la révélation, la room qui se vide et
    // se réinitialise, puis une reconnexion. Seul cet état diffusé nous l'apprend.
    act(() => {
      triggerSocketEvent("room:state", makeState({ players: [host(), guest()] }));
    });

    expect(screen.queryByText("Ronflex")).toBeNull();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
  });

  it("ne garde pas la révélation en mémoire une fois la partie finie", () => {
    renderRoom();
    playUntilEnd();

    // Même sans rejouer : une partie terminée n'a plus de révélation en cours.
    act(() => {
      triggerSocketEvent("room:state", makeState({ players: [host(), guest()] }));
    });
    expect(screen.queryByText("Ronflex")).toBeNull();
  });
});

describe("Room — QR code de la room", () => {
  it("le garde replié par défaut, le lobby portant déjà beaucoup de commandes", () => {
    renderRoom();
    settleJoin(makeState());
    expect(screen.getByRole("button", { name: "Afficher le QR code" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();
  });

  it("encode l'adresse complète de la room, celle qu'un invité doit ouvrir", () => {
    renderRoom();
    settleJoin(makeState());

    fireEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));

    expect(
      screen.getByRole("img", { name: `QR code vers ${window.location.origin}/room/ABCD` }),
    ).toBeInTheDocument();
  });

  it("se replie", () => {
    renderRoom();
    settleJoin(makeState());
    fireEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));
    fireEvent.click(screen.getByRole("button", { name: "Masquer le QR code" }));
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();
  });

  it("reste proposé à un invité, qui peut faire entrer quelqu'un d'autre", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }), "guest-1");
    expect(screen.getByRole("button", { name: "Afficher le QR code" })).toBeInTheDocument();
  });

  // Le QR ne sert à rien sur le téléphone qui l'affiche, ni à qui ne le voit pas :
  // le lien copiable reste la voie universelle.
  it("ne remplace pas le lien copiable", () => {
    renderRoom();
    settleJoin(makeState());
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
  });

  it("disparaît une fois la partie lancée, le lobby n'étant plus affiché", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));
    fireEvent.click(screen.getByRole("button", { name: "Afficher le QR code" }));
    expect(screen.getByRole("img", { name: /QR code/ })).toBeInTheDocument();

    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 25,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();
  });
});

describe("Room — Pokédex consultable depuis le lobby", () => {
  it("laisse le Pokédex replié par défaut, pour ne pas noyer le lobby", () => {
    renderRoom();
    settleJoin(makeState());

    expect(screen.getByRole("button", { name: /Pokédex/ })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("déplie la liste sans quitter la room", () => {
    renderRoom();
    settleJoin(makeState());

    fireEvent.click(screen.getByRole("button", { name: /Pokédex/ }));

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByText("Bulbizarre")).toBeInTheDocument();
    // Le point qui compte : consulter ne doit pas envoyer room:leave ni couper le socket.
    expect(emittedOf("room:leave")).toHaveLength(0);
  });

  it("s'ouvre sur les générations de la partie à venir", () => {
    renderRoom();
    settleJoin(makeState({ settings: { ...DEFAULT_SETTINGS, generations: [2] } }));

    fireEvent.click(screen.getByRole("button", { name: /Pokédex/ }));

    // Génération 2 : Héricendre en fait partie, Bulbizarre non.
    expect(screen.getByText("Héricendre")).toBeInTheDocument();
    expect(screen.queryByText("Bulbizarre")).toBeNull();
  });

  it("est proposé aussi à un invité, qui ne règle rien mais peut réviser", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }), "guest-1");
    expect(screen.getByRole("button", { name: /Pokédex/ })).toBeInTheDocument();
  });

  // Anti-triche : la liste donne le nom correspondant à chaque numéro. L'avoir sous la
  // main pendant une manche reviendrait à afficher la réponse à côté de la question.
  it("disparaît dès que la partie démarre", () => {
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()] }));
    fireEvent.click(screen.getByRole("button", { name: /Pokédex/ }));
    expect(screen.getByRole("searchbox")).toBeInTheDocument();

    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 25,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Pokédex/ })).toBeNull();
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

  it("rappelle le Pokémon répondu et retire le champ, au lieu de laisser resaisir", async () => {
    const user = userEvent.setup();
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 143,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    await user.type(screen.getByRole("combobox"), "pika");
    await user.keyboard("{Enter}{Enter}");
    // Le serveur accuse réception : c'est lui qui fait foi sur « la réponse est prise ».
    act(() => {
      emittedOf("round:answer")[0]?.ack?.({ ok: true, data: null });
    });

    expect(screen.getByText(/Votre réponse/)).toHaveTextContent("Pikachu");
    // Le champ disparaît : le garder actif invitait à resaisir pour récolter une erreur.
    expect(screen.queryByRole("combobox")).toBeNull();
    // Le numéro cible reste visible, on attend toujours les autres.
    expect(screen.getByLabelText("Numéro cible 143")).toBeInTheDocument();
  });

  it("laisse resaisir si le serveur a refusé la réponse", async () => {
    const user = userEvent.setup();
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 143,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    await user.type(screen.getByRole("combobox"), "pika");
    await user.keyboard("{Enter}{Enter}");
    act(() => {
      emittedOf("round:answer")[0]?.ack?.({
        ok: false,
        code: "NOT_IN_POOL",
        message: "Hors pool.",
      });
    });

    // Rien n'a été enregistré côté serveur : le joueur doit pouvoir réessayer.
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByText(/Votre réponse/)).toBeNull();
  });

  it("oublie la réponse précédente à la manche suivante", async () => {
    const user = userEvent.setup();
    renderRoom();
    settleJoin(makeState({ players: [host(), guest()], status: "round" }));
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 143,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });
    await user.type(screen.getByRole("combobox"), "pika");
    await user.keyboard("{Enter}{Enter}");
    act(() => {
      emittedOf("round:answer")[0]?.ack?.({ ok: true, data: null });
    });
    expect(screen.getByText(/Votre réponse/)).toBeInTheDocument();

    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 1,
        roundCount: 10,
        targetId: 25,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    expect(screen.queryByText(/Votre réponse/)).toBeNull();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("dit qu'on a déjà répondu après une reconnexion, sans rouvrir le champ", () => {
    renderRoom();
    // Le serveur nous sait ayant répondu ; le nom du Pokémon, lui, ne survit pas au
    // rechargement — il n'a jamais transité par le réseau.
    settleJoin(
      makeState({
        players: [host({ hasAnswered: true }), guest()],
        status: "round",
      }),
    );
    act(() => {
      triggerSocketEvent("round:start", {
        roundIndex: 0,
        roundCount: 10,
        targetId: 143,
        endsAt: Date.now() + 15000,
        serverNow: Date.now(),
      });
    });

    expect(screen.getByText(/déjà répondu/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
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
