/**
 * Petits outils communs aux routes API : réponses JSON, erreurs en
 * français, vérification du mot de passe formateur.
 */

import { NextResponse } from "next/server";
import { isAdmin } from "./auth.ts";
import { GameError } from "./game-server.ts";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

/** Toutes les erreurs ont la même forme : { erreur: "..." }. */
export function fail(message: string, status = 400) {
  return NextResponse.json({ erreur: message }, { status });
}

/** Lit le corps JSON d'une requête sans jamais planter. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * À appeler en première ligne des routes réservées au formateur.
 * Renvoie une réponse 401 à retourner tout de suite, ou null si tout va bien.
 */
export async function blockIfNotAdmin(): Promise<NextResponse | null> {
  try {
    if (await isAdmin()) return null;
  } catch (error) {
    return fail(messageOf(error), 500);
  }
  return fail("Vous n'êtes pas connecté. Retournez sur /formateur.", 401);
}

/** Transforme n'importe quelle erreur en message lisible en français. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Une erreur inattendue est survenue.";
}

/**
 * Enveloppe une route : si quelque chose casse, on renvoie un message
 * en français au lieu d'une page d'erreur de Next.js.
 */
export async function guard(
  work: () => Promise<Response>,
): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    // Une GameError porte son propre code HTTP (404 pour un code de partie
    // inconnu, 409 pour « déjà répondu »...). Sans ce cas, tout finirait en
    // 500 et le téléphone afficherait « erreur serveur » au lieu du vrai
    // message.
    if (error instanceof GameError) {
      return fail(error.message, error.status);
    }
    console.error("[quiz] erreur de route :", error);
    return fail(messageOf(error), 500);
  }
}

export function asString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max).trim();
}

export function asInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(asString(value, 20));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Nettoie un nom de joueur : 24 caractères maximum, pas de HTML possible. */
export function cleanPlayerName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}
