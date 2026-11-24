"use client";

/**
 * La place de l'apprenant, gardée dans son navigateur.
 *
 * C'est ce qui permet la reconnexion : si le téléphone recharge la page
 * ou perd le réseau, il retrouve ses points et la question en cours.
 * Seul le jeton est stocké ici ; tout le reste vient du serveur.
 */

const CLE = "quiz.joueur";

export interface SessionJoueur {
  playerId: string;
  token: string;
  gameId: string;
  code: string;
}

export function lireSession(): SessionJoueur | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const session = JSON.parse(brut) as SessionJoueur;
    if (!session?.playerId || !session?.token) return null;
    return session;
  } catch {
    return null;
  }
}

export function ecrireSession(session: SessionJoueur): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(session));
  } catch {
    /* navigation privée : on continue sans mémoire */
  }
}

export function effacerSession(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* sans importance */
  }
}

/** Appelle une route joueur en y joignant le jeton. */
export async function appelJoueur<T>(
  chemin: string,
  session: SessionJoueur,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; donnees: T & { erreur?: string } }> {
  const reponse = await fetch(chemin, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: session.playerId,
      token: session.token,
      ...extra,
    }),
  });
  const donnees = await reponse.json().catch(() => ({}));
  return { ok: reponse.ok, status: reponse.status, donnees };
}
