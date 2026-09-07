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
    /**
     * `onSettled` est appelé avec l'accusé de réception une fois l'écriture réseau (débattue)
     * effectivement partie et son accusé revenu — jamais pour un appel annulé par un clic
     * suivant. Permet à l'appelant de composer plusieurs clics rapprochés côté état local
     * puis de se réconcilier avec l'état serveur une fois la seule écriture réelle actée.
     */
    setSettings: (settings: GameSettings, onSettled?: (ack: Ack<unknown>) => void) => void;
    answer: (pokemonId: number) => void;
    /** `sameSeries: true` rejoue la série de cibles de la partie qui vient de se terminer. */
    playAgain: (sameSeries: boolean) => void;
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
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Distingue la toute première connexion (déjà prise en charge par l'effet de montage
    // ci-dessous, qui émet lui-même `room:create`/`room:join`/`room:rejoin`) d'une vraie
    // reconnexion transport. Si le socket n'est pas encore connecté au moment où cet effet
    // s'enregistre, le tout prochain "connect" sera cette première connexion : on l'ignore
    // une seule fois puis on redevient attentif à toute reconnexion ultérieure. S'il est
    // déjà connecté (socket réutilisé après une navigation interne), il n'y aura jamais de
    // "connect" correspondant à "maintenant" : tout "connect" à venir est par construction
    // une vraie reconnexion, donc rien à ignorer.
    let skipNextConnect = !socket.connected;

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
    // la fenêtre de grâce. Ne rejoue `room:rejoin` que sur une vraie reconnexion — jamais
    // sur la connexion initiale, déjà prise en charge par l'effet de montage — sans quoi
    // les deux jointures partiraient en parallèle et produiraient un siège fantôme dès
    // qu'une session stockée est périmée (l'accusé de la seconde jointure écrase alors
    // celui de la première dans le stockage, qui ne répond plus jamais).
    const handleConnect = () => {
      setReconnecting(false);
      if (skipNextConnect) {
        skipNextConnect = false;
        return;
      }
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

  // Un joueur qui navigue ailleurs reste sinon marqué `connected` côté serveur jusqu'à
  // l'expiration de la fenêtre de grâce : un fantôme dans le lobby qui ne répond jamais,
  // forçant chaque manche à courir jusqu'à son terme puisque la clôture anticipée exige que
  // tous les joueurs connectés aient répondu. D'où l'envoi de `room:leave` au démontage.
  //
  // Mais en développement, `<StrictMode>` monte, nettoie puis remonte immédiatement (de
  // façon synchrone, sans jamais rendre la main au navigateur) pour vérifier que les effets
  // sont rejouables sans effet de bord observable. Un `room:leave` envoyé tout de suite
  // dans ce nettoyage confondrait cette vérification avec une vraie navigation : le joueur
  // serait éjecté côté serveur, et jamais réintégré puisque `joined` (ref) empêche le
  // remount de rejouer la jointure — exactement le bug constaté (Hote+Dresseur → Hote
  // seul). On diffère donc l'envoi d'une macrotâche : le remount StrictMode s'exécute avant
  // que ce timer ne se déclenche et l'annule ; seul un vrai démontage (navigation, fermeture
  // d'onglet) laisse le timer aller à son terme. Quand il se déclenche réellement, on
  // réarme aussi `joined` : si ce même composant venait à se remonter plus tard pour de bon
  // (au lieu d'un remount StrictMode synchrone), il rejoue sa jointure au lieu de rester
  // bloqué sur l'état d'avant le départ.
  useEffect(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    return () => {
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        joined.current = false;
        getSocket().emit("room:leave", {}, () => {
          // Personne n'observe plus l'accusé : le composant est réellement démonté.
        });
      }, 0);
    };
  }, []);

  const emitSimple = useCallback((event: "room:start" | "room:leave") => {
    const socket = getSocket();
    const onAck = (ack: Ack<unknown>) => {
      setActionError(ack.ok ? null : ack.message);
    };
    if (event === "room:start") {
      socket.emit("room:start", {}, onAck);
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
      playAgain: (sameSeries) => {
        setFinal(null);
        getSocket().emit("room:playAgain", { sameSeries }, (ack) => {
          setActionError(ack.ok ? null : ack.message);
        });
      },
      leave: () => emitSimple("room:leave"),
      dismissActionError: () => setActionError(null),
      setSettings: (settings, onSettled) => {
        // GenerationPicker émet un événement par case cochée : sans ce débounce, un hôte qui
        // bascule plusieurs générations peut plausiblement atteindre la limite de débit
        // serveur (20 événements / 10 s) et se faire déconnecter pour ça. On ne débat que
        // l'écriture réseau elle-même : l'appelant est responsable de composer les clics
        // successifs côté état local (voir Room.tsx) pour qu'aucun ne soit perdu, ce
        // `settings` n'étant jamais que la dernière valeur composée au moment de l'appel.
        if (settingsTimer.current) clearTimeout(settingsTimer.current);
        settingsTimer.current = setTimeout(() => {
          getSocket().emit("room:settings", { settings }, (ack) => {
            setActionError(ack.ok ? null : ack.message);
            onSettled?.(ack);
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
