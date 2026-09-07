/**
 * Double de test pour `getSocket()` (voir `socket.ts`), utilisé exclusivement via
 * `vi.mock("./socket.js", …)` dans `useRoom.test.ts` et `Room.test.tsx`. N'est jamais
 * importé par du code de production — ce n'est pas une nouvelle surface d'injection sur
 * `socket.ts`, seulement le remplacement complet du module dans le graphe de test.
 *
 * Reproduit la portion de l'API `socket.io-client` réellement consommée par `useRoom` :
 * `on` / `off` / `emit`, la propriété `connected` et `connect()`. Les tests déclenchent
 * eux-mêmes les événements serveur→client via `triggerSocketEvent` et inspectent les
 * émissions client→serveur via `getEmittedCalls`, y compris pour répondre manuellement à
 * un accusé de réception (`ack`) comme le ferait le serveur.
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@pkfind/shared";
import type { AppSocket } from "./socket.js";

type ServerEvent = keyof ServerToClientEvents;
type ClientEvent = keyof ClientToServerEvents;
type Listener = (...args: unknown[]) => void;

export type EmittedCall = {
  event: ClientEvent;
  payload: unknown;
  ack: ((response: unknown) => void) | undefined;
};

let connected = false;
let connectCallCount = 0;
const listeners = new Map<string, Set<Listener>>();
const emitted: EmittedCall[] = [];

const fakeSocket = {
  get connected() {
    return connected;
  },
  on(event: string, handler: Listener) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return fakeSocket;
  },
  off(event: string, handler?: Listener) {
    if (handler) listeners.get(event)?.delete(handler);
    else listeners.delete(event);
    return fakeSocket;
  },
  emit(event: string, payload: unknown, ack?: (response: unknown) => void) {
    emitted.push({ event: event as ClientEvent, payload, ack });
    return fakeSocket;
  },
  connect() {
    connected = true;
    connectCallCount += 1;
    return fakeSocket;
  },
} as unknown as AppSocket;

export function getSocket(): AppSocket {
  return fakeSocket;
}

/** À appeler dans un `beforeEach` : repart d'un socket neuf, déconnecté, sans historique. */
export function resetFakeSocket(): void {
  connected = false;
  connectCallCount = 0;
  listeners.clear();
  emitted.length = 0;
}

export function setSocketConnected(value: boolean): void {
  connected = value;
}

export function getConnectCallCount(): number {
  return connectCallCount;
}

/** Déclenche tous les gestionnaires enregistrés pour un événement serveur→client donné. */
export function triggerSocketEvent<E extends ServerEvent>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void;
export function triggerSocketEvent(event: "connect", ...args: []): void;
export function triggerSocketEvent(event: "disconnect", ...args: [string]): void;
export function triggerSocketEvent(event: string, ...args: unknown[]): void {
  for (const handler of listeners.get(event) ?? []) handler(...args);
}

export function getEmittedCalls(): readonly EmittedCall[] {
  return emitted;
}

export function emittedOf(event: ClientEvent): EmittedCall[] {
  return emitted.filter((call) => call.event === event);
}

export function hasListenerFor(event: ServerEvent | "connect" | "disconnect"): boolean {
  return (listeners.get(event)?.size ?? 0) > 0;
}
