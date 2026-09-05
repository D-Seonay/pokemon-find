import { randomInt } from "node:crypto";
import { RoomError } from "./Room.js";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw: string): string {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) throw new RoomError("INVALID_CODE");
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) throw new RoomError("INVALID_CODE");
  }
  return code;
}
