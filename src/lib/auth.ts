/**
 * Protection de l'espace formateur par mot de passe.
 *
 * Il n'y a pas de base d'utilisateurs : un seul mot de passe, celui de la
 * variable d'environnement ADMIN_PASSWORD. Apres verification, on pose un
 * cookie httpOnly signe (HMAC-SHA256) que le navigateur ne peut pas fabriquer.
 * La cle de signature derive du mot de passe : le changer invalide toutes
 * les sessions ouvertes, ce qui est le comportement souhaite.
 */

import { cookies } from "next/headers";

export const ADMIN_COOKIE = "quiz_formateur";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 heures : une journee de formation

export class ConfigError extends Error {}

function adminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.trim() === "") {
    throw new ConfigError(
      "ADMIN_PASSWORD n'est pas défini. Ajoutez-le dans .env.local (en local) " +
        "ou dans les variables d'environnement de Vercel.",
    );
  }
  return password;
}

/** Comparaison a temps constant : ne renseigne pas sur le nombre de
 *  caracteres corrects en mesurant le temps de reponse. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

async function sign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`quiz-direct::${adminPassword()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Valeur du cookie : « dateDExpiration.signature ». */
export async function createSessionValue(): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  return `${expiry}.${await sign(expiry)}`;
}

export async function isValidSessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiry = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const expiryMs = Number(expiry);
  if (!Number.isFinite(expiryMs) || expiryMs < Date.now()) return false;

  return constantTimeEqual(signature, await sign(expiry));
}

export function checkPassword(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  return constantTimeEqual(candidate, adminPassword());
}

/** Le formateur est-il connecte sur cette requete ? */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return isValidSessionValue(store.get(ADMIN_COOKIE)?.value);
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
