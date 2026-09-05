import {
  type Ack,
  DEFAULT_SETTINGS,
  type GameSettings,
  type Pokemon,
  type RoomState,
  type RoundResult,
  type Standing,
} from "@pkfind/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { KEYS, readJson, writeJson } from "../storage/local.js";
import { getSocket } from "./socket.js";

type Session = { roomCode: string; playerId: string; playerToken: string };

const SETTINGS_DEBOUNCE_MS = 250;

export type RoundView = {
  roundIndex: number;
  roundCount: number;
  targetId: number;
  localEndsAt: number;
};

export type RevealView = {
  target: Pokemon;
  results: RoundResult[];
  standings: Standing[];
  localEndsAt: number;
};

export type RoomView = {
  connecting: boolean;
  /** Erreur fatale, issue du chemin de jointure : remplace tout l'écran, on ne peut pas continuer. */
  error: string | null;
  /** Erreur passagère, issue d'une action : à afficher en bandeau par-dessus l'écran courant. */
  actionError: string | null;
  reconnecting: boolean;
  closed: string | null;
  state: RoomState | null;
  playerId: string | null;
  round: RoundView | null;
  reveal: RevealView | null;
  final: { standings: Standing[]; history: RoundResult[][] } | null;
  actions: {
    start: () => void;
    setSettings: (settings: GameSettings) => void;
    answer: (pokemonId: number) => void;
    playAgain: () => void;
    leave: () => void;
    dismissActionError: () => void;
  };
};

export function useRoom(input: {
  code: string;
  nickname: string;
  create: boolean;
  onCreated: (code: string) => void;
}): RoomView {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState<RoundView | null>(null);
  const [reveal, setReveal] = useState<RevealView | null>(null);
  const [final, setFinal] = useState<RoomView["final"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const joined = useRef(false);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toujours à jour sans jamais forcer les effets ci-dessous à se réenregistrer : le
  // gestionnaire `connect`, posé une seule fois au montage, doit malgré tout pouvoir lire
  // le code de room et le pseudo courants au moment où la reconnexion se produit.
  const inputRef = useRef(input);
  inputRef.current = input;

  const remember = useCallback((session: Session) => {
    writeJson(KEYS.session, session, "session");
    setPlayerId(session.playerId);
  }, []);

  // Tente de reprendre une session existante (token + identifiants stockés) et, si le
  // serveur la refuse (jeton périmé, room recréée, etc.), retombe sur une jointure neuve —
  // exactement le comportement historique du montage, désormais partagé avec la reconnexion
  // transport (`socket.io-client` reconnecte le socket automatiquement après une coupure,
  // mais ne rejoue jamais `room:rejoin` de lui-même).
  const rejoinSession = useCallback(
    (session: Session) => {
      getSocket().emit("room:rejoin", session, (ack: Ack<{ state: RoomState }>) => {
        if (ack.ok) {
          setPlayerId(session.playerId);
          setState(ack.data.state);
          return;
        }
        getSocket().emit(
          "room:join",
          { roomCode: inputRef.current.code, nickname: inputRef.current.nickname },
          (retry) => {
            if (!retry.ok) {
              setError(retry.message);
              return;
            }
            remember(retry.data);
            setState(retry.data.state);
          },
        );
      });
    },
    [remember],
  );

  useEffect(() => {
    const socket = getSocket();

    socket.on("room:state", (nextState) => {
      setState(nextState);
      // Rejouer ne notifie que l'hôte via l'accusé de sa propre requête ; les autres
      // joueurs n'apprennent le retour au lobby que par cette diffusion. Sans ce nettoyage,
      // ils resteraient bloqués sur le classement final de la partie précédente.
      if (nextState.status !== "finished") setFinal(null);
    });
    socket.on("round:start", (payload) => {
      setReveal(null);
      setRound({
        roundIndex: payload.roundIndex,
        roundCount: payload.roundCount,
        targetId: payload.targetId,
        localEndsAt: Date.now() + (payload.endsAt - payload.serverNow),
      });
    });
    socket.on("round:reveal", (payload) => {
      setRound(null);
      setReveal({
        target: payload.target,
        results: payload.results,
        standings: payload.standings,
        localEndsAt: Date.now() + (payload.revealEndsAt - payload.serverNow),
      });
    });
    socket.on("game:end", (payload) => {
      setRound(null);
      setFinal(payload);
    });
    socket.on("room:closed", (payload) => setClosed(payload.reason));

    // Une coupure de transport (wifi qui saute, tunnel qui expire) reconnecte le socket
    // avec un nouvel id et un `socket.data` vide côté serveur : sans ce rattrapage, le
    // joueur resterait figé sur son dernier écran pour toujours, jusqu'à son retrait après
    // la fenêtre de grâce. Ne rejoue `room:rejoin` que si une session a déjà été établie —
    // le montage s'en charge déjà pour la toute première connexion — pour ne jamais
    // déclencher une double jointure.
    const handleConnect = () => {
      setReconnecting(false);
      const stored = readJson<Session | null>(KEYS.session, null, "session");
      if (stored && stored.roomCode === inputRef.current.code) rejoinSession(stored);
    };
    // "io server disconnect" (déconnexion forcée par le serveur, par ex. après une limite
    // de débit atteinte) n'est jamais suivie d'une reconnexion automatique côté client :
    // il faut la redemander explicitement, sans quoi l'indicateur "Reconnexion…" mentirait.
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
      setReconnecting(true);
      if (reason === "io server disconnect") socket.connect();
    };
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("room:state");
      socket.off("round:start");
      socket.off("round:reveal");
      socket.off("game:end");
      socket.off("room:closed");
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [rejoinSession]);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    const socket = getSocket();

    const stored = readJson<Session | null>(KEYS.session, null, "session");
    if (!input.create && stored && stored.roomCode === input.code) {
      rejoinSession(stored);
      return;
    }

    if (input.create) {
      socket.emit(
        "room:create",
        { nickname: input.nickname, settings: DEFAULT_SETTINGS },
        (ack) => {
          if (!ack.ok) {
            setError(ack.message);
            return;
          }
          remember(ack.data);
          setState(ack.data.state);
          input.onCreated(ack.data.roomCode);
        },
      );
      return;
    }

    socket.emit("room:join", { roomCode: input.code, nickname: input.nickname }, (ack) => {
      if (!ack.ok) {
        setError(ack.message);
        return;
      }
      remember(ack.data);
      setState(ack.data.state);
    });
  }, [input, input.code, input.create, input.nickname, rejoinSession, remember]);

  useEffect(() => {
    return () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
    };
  }, []);

  const emitSimple = useCallback((event: "room:start" | "room:playAgain" | "room:leave") => {
    const socket = getSocket();
    const onAck = (ack: Ack<unknown>) => {
      setActionError(ack.ok ? null : ack.message);
    };
    if (event === "room:start") {
      socket.emit("room:start", {}, onAck);
    } else if (event === "room:playAgain") {
      socket.emit("room:playAgain", {}, onAck);
    } else {
      socket.emit("room:leave", {}, onAck);
    }
  }, []);

  return {
    connecting: state === null && error === null,
    error,
    actionError,
    reconnecting,
    closed,
    state,
    playerId,
    round,
    reveal,
    final,
    actions: {
      start: () => emitSimple("room:start"),
      playAgain: () => {
        setFinal(null);
        emitSimple("room:playAgain");
      },
      leave: () => emitSimple("room:leave"),
      dismissActionError: () => setActionError(null),
      setSettings: (settings) => {
        // GenerationPicker émet un événement par case cochée : sans ce débounce, un hôte qui
        // bascule plusieurs générations peut plausiblement atteindre la limite de débit
        // serveur (20 événements / 10 s) et se faire déconnecter pour ça.
        if (settingsTimer.current) clearTimeout(settingsTimer.current);
        settingsTimer.current = setTimeout(() => {
          getSocket().emit("room:settings", { settings }, (ack) => {
            setActionError(ack.ok ? null : ack.message);
          });
        }, SETTINGS_DEBOUNCE_MS);
      },
      answer: (pokemonId) => {
        if (!round) return;
        getSocket().emit("round:answer", { roundIndex: round.roundIndex, pokemonId }, (ack) => {
          setActionError(ack.ok ? null : ack.message);
        });
      },
    },
  };
}
