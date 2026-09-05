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
import { KEYS, readJson, writeJson } from "../storage/local.js";
import { getSocket } from "./socket.js";

type Session = { roomCode: string; playerId: string; playerToken: string };

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
  error: string | null;
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
  const [closed, setClosed] = useState<string | null>(null);
  const joined = useRef(false);

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

    return () => {
      socket.off("room:state");
      socket.off("round:start");
      socket.off("round:reveal");
      socket.off("game:end");
      socket.off("room:closed");
    };
  }, []);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    const socket = getSocket();

    const remember = (session: Session) => {
      writeJson(KEYS.session, session, "session");
      setPlayerId(session.playerId);
    };

    const stored = readJson<Session | null>(KEYS.session, null, "session");
    if (!input.create && stored && stored.roomCode === input.code) {
      socket.emit("room:rejoin", stored, (ack: Ack<{ state: RoomState }>) => {
        if (ack.ok) {
          setPlayerId(stored.playerId);
          setState(ack.data.state);
          return;
        }
        socket.emit("room:join", { roomCode: input.code, nickname: input.nickname }, (retry) => {
          if (!retry.ok) {
            setError(retry.message);
            return;
          }
          remember(retry.data);
          setState(retry.data.state);
        });
      });
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
  }, [input, input.code, input.create, input.nickname]);

  const emitSimple = useCallback((event: "room:start" | "room:playAgain" | "room:leave") => {
    const socket = getSocket();
    const onAck = (ack: Ack<unknown>) => {
      if (!ack.ok) setError(ack.message);
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
      setSettings: (settings) =>
        getSocket().emit("room:settings", { settings }, (ack) => {
          if (!ack.ok) setError(ack.message);
        }),
      answer: (pokemonId) => {
        if (!round) return;
        getSocket().emit("round:answer", { roundIndex: round.roundIndex, pokemonId }, (ack) => {
          if (!ack.ok) setError(ack.message);
        });
      },
    },
  };
}
