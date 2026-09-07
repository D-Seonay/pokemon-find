import { ERROR_MESSAGES, type ErrorCode } from "@pkfind/shared";

/**
 * L'erreur métier des rooms : elle porte un code du protocole, que la couche socket
 * retransforme en accusé de réception d'échec. Vit dans son propre module pour que
 * `Room` et `RoundEngine` puissent la lever tous les deux sans se référencer l'un l'autre
 * (`Room.ts` la ré-exporte, c'est encore de là que tout le reste du serveur l'importe).
 */
export class RoomError extends Error {
  constructor(readonly code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "RoomError";
  }
}
