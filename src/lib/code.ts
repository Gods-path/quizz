/**
 * Le code de partie affiche au vidéoprojecteur.
 * Pas de caracteres ambigus : ni 0/O, ni 1/I/L.
 */

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function generateGameCode(): string {
  const size = CODE_ALPHABET.length;
  // On rejette les octets qui biaiseraient le tirage.
  const limit = Math.floor(256 / size) * size;
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % size];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}

/**
 * Nettoie un code tape par un apprenant : majuscules, espaces et tirets
 * retires, puis tout caractere impossible est simplement ignore.
 * Comme l'alphabet exclut deja 0, O, 1, I et L, il n'y a aucune confusion
 * a rattraper : un code mal tape reste un code faux, et on le dit.
 */
export function normalizeGameCode(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((char) => CODE_ALPHABET.includes(char))
    .join("")
    .slice(0, CODE_LENGTH);
}

export function isValidGameCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return code.split("").every((char) => CODE_ALPHABET.includes(char));
}
