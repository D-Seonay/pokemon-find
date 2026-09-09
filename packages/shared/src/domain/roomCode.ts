/**
 * Les codes de room, définis ici plutôt que côté serveur parce que les deux applications
 * en ont besoin : le serveur pour générer et valider, le front pour guider la saisie.
 * Une seconde définition côté client divergerait tôt ou tard, et la divergence se verrait
 * sous forme de codes valides refusés à la saisie — ou l'inverse.
 */

/**
 * Ni `I`, ni `O`, ni `0`, ni `1` : ce sont exactement les caractères qu'on confond en
 * lisant un code à voix haute, et un code de room se dicte plus souvent qu'il ne se copie.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 4;

export function isCodeChar(char: string): boolean {
  return CODE_ALPHABET.includes(char);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const char of code) {
    if (!isCodeChar(char)) return false;
  }
  return true;
}

/**
 * Ce qu'on garde d'une saisie libre : majuscules, caractères de l'alphabet uniquement,
 * tronqué à la longueur d'un code. Rend la frappe tolérante (espaces, minuscules, collage
 * d'un code entouré de texte) sans jamais produire une valeur que le serveur refuserait.
 */
export function sanitizeRoomCodeInput(raw: string): string {
  let out = "";
  for (const char of raw.toUpperCase()) {
    if (out.length === CODE_LENGTH) break;
    if (isCodeChar(char)) out += char;
  }
  return out;
}
