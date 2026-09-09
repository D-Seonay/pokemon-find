import { randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH, isValidRoomCode } from "@pkfind/shared";
import { RoomError } from "./Room.js";

// Réexportés pour ne pas casser les imports existants : l'alphabet et la longueur sont
// désormais définis dans `@pkfind/shared`, le front en ayant besoin pour guider la saisie
// (voir `sanitizeRoomCodeInput`). Une seconde définition ici finirait par diverger.
export { CODE_ALPHABET, CODE_LENGTH };

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw: string): string {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (!isValidRoomCode(code)) throw new RoomError("INVALID_CODE");
  return code;
}
