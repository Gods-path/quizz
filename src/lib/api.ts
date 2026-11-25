/**
 * Petits outils communs aux routes API : réponses JSON, erreurs en
 * français, vérification du mot de passe formateur.
 */

import { NextResponse } from "next/server";
import { isAdmin } from "./auth.ts";
import { GameError } from "./game-server.ts";

// Les helpers purs vivent dans entrees.ts pour pouvoir être testés sans
// Next ni Supabase. On les réexporte : les routes continuent de les
// importer depuis « @/lib/api ».
export { asInt, asString, cleanPlayerName } from "./entrees.ts";

/**
 * Rien de ce que renvoient ces routes ne doit être gardé en mémoire, nulle
 * part. L'état d'une partie change toutes les secondes : une réponse
 * réchauffée afficherait la question précédente.
 *
 * Ce n'est pas une précaution théorique. Next.js ne met pas ces routes en
 * cache, mais entre le téléphone et le serveur il y a le cache du
 * navigateur et, sur les réseaux mobiles, les relais de l'opérateur. Deux
 * mots d'en-tête suffisent à les écarter tous.
 */
const SANS_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data as Record<string, unknown>, {
    status,
    headers: SANS_CACHE,
  });
}

/** Toutes les erreurs ont la même forme : { erreur: "..." }. */
export function fail(message: string, status = 400) {
  return NextResponse.json({ erreur: message }, { status, headers: SANS_CACHE });
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
