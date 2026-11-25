"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "./supabase-browser.ts";
import type { GamePhase } from "./types.ts";

/**
 * Écoute en direct les changements de la partie.
 *
 * Deux tables seulement sont écoutées — `games` (la phase, la question en
 * cours, les compteurs) et `players` (qui arrive, les scores) — parce que
 * ce sont les deux seules que le navigateur a le droit de lire. Les
 * questions et les réponses ne passent jamais par là.
 *
 * ---------------------------------------------------------------------------
 *  POURQUOI CE CODE EST PLUS COMPLIQUÉ QU'UN SIMPLE « on recharge »
 * ---------------------------------------------------------------------------
 *
 *  Mesuré sur une partie à 20 apprenants : la clôture d'UNE question
 *  produisait 41 messages temps réel (un par réponse enregistrée, un par
 *  score mis à jour, un pour le changement de phase). Comme chaque message
 *  déclenchait un appel au serveur, chaque téléphone faisait 41 appels,
 *  soit 820 pour la salle — pour UNE question. À 40 apprenants on dépasse
 *  3 000 : le quiz se figeait sur la question 1.
 *
 *  Le coût augmente comme le CARRÉ du nombre d'apprenants. Trois idées le
 *  ramènent à quelque chose de proportionnel :
 *
 *  1. Un message qui ne change que des COMPTEURS (« 12 sur 20 ont
 *     répondu ») ne vaut pas un aller-retour : la ligne complète est déjà
 *     dans le message, on la passe telle quelle à `surCompteurs`.
 *
 *  2. Seul un changement de PHASE ou de NUMÉRO DE QUESTION mérite un vrai
 *     rafraîchissement — et là, il faut aller vite. Les rafales sont
 *     regroupées : vingt messages simultanés ne valent qu'un appel.
 *
 *  3. Un téléphone n'a aucun usage des scores des autres : il n'écoute donc
 *     pas la table `players` (`ecouterJoueurs: false`). Seul l'écran du
 *     formateur, qui affiche le classement, s'y abonne.
 */

/** Ce que le message temps réel contient : la ligne `games` entière. */
export interface LignePartie {
  id: string;
  phase: GamePhase;
  current_index: number;
  paused_at: string | null;
  answered_count: number;
  player_count: number;
  question_duration_seconds: number | null;
  question_started_at: string | null;
}

/** Changement de phase : il faut tout relire, et tout de suite. */
const GROUPAGE_URGENT_MS = 120;

/** Scores et arrivées : un rafraîchissement par seconde et demie suffit,
 *  et c'est ce qui permet de tenir la charge d'une classe entière. */
const GROUPAGE_LENT_MS = 1500;

export interface OptionsRealtime {
  /** Filet de sécurité : rafraîchissement périodique même sans message. */
  secoursMs?: number;
  /** Appelé quand SEULS les compteurs ont bougé : évite un appel serveur. */
  surCompteurs?: (ligne: LignePartie) => void;
  /** S'abonner aux scores des joueurs. Inutile sur un téléphone. */
  ecouterJoueurs?: boolean;
}

export function useRealtimeGame(
  gameId: string | null,
  onChange: () => void,
  { secoursMs = 4000, surCompteurs, ecouterJoueurs = true }: OptionsRealtime = {},
): void {
  const rappel = useRef(onChange);
  rappel.current = onChange;
  const rappelCompteurs = useRef(surCompteurs);
  rappelCompteurs.current = surCompteurs;

  useEffect(() => {
    if (!gameId) return;

    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    let urgenceEnAttente = false;
    /** Signature de l'état « qui compte » : phase, question, pause. */
    let forme: string | null = null;

    const lancer = () => {
      minuteur = null;
      urgenceEnAttente = false;
      if (vivant) rappel.current();
    };

    /**
     * Programme un rafraîchissement. Plusieurs appels rapprochés n'en
     * produisent qu'un seul. Une urgence double un délai lent déjà posé.
     */
    const programmer = (urgent: boolean) => {
      if (!vivant) return;
      if (minuteur !== null) {
        if (!urgent || urgenceEnAttente) return;
        clearTimeout(minuteur); // un lent était posé : l'urgence passe devant
      }
      urgenceEnAttente = urgent;
      minuteur = setTimeout(lancer, urgent ? GROUPAGE_URGENT_MS : GROUPAGE_LENT_MS);
    };

    const surPartie = (message: { new?: unknown }) => {
      const ligne = message.new as LignePartie | undefined;
      if (!ligne || typeof ligne.phase !== "string") {
        programmer(true); // message incomplet : on relit par sécurité
        return;
      }
      const nouvelleForme = `${ligne.phase}|${ligne.current_index}|${ligne.paused_at ?? ""}`;
      // Au tout premier message on ne connaît pas l'état précédent : la page
      // vient d'être chargée, elle est donc déjà à jour. Pas d'urgence.
      const change = forme !== null && forme !== nouvelleForme;
      forme = nouvelleForme;

      if (change) {
        programmer(true);
        return;
      }

      // Rien d'important n'a bougé : seuls des compteurs. Si la page sait
      // les traiter elle-même, on s'arrête là — ZÉRO appel au serveur. Le
      // rafraîchissement de secours passera de toute façon dans quelques
      // secondes, donc rien ne peut rester en retard durablement.
      if (rappelCompteurs.current) {
        rappelCompteurs.current(ligne);
        return;
      }
      programmer(false);
    };

    const client = supabaseBrowser();
    let canal = client.channel(`partie-${gameId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "games",
        filter: `id=eq.${gameId}`,
      },
      surPartie,
    );

    if (ecouterJoueurs) {
      canal = canal.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        // Un joueur arrive, ou son score change : jamais urgent.
        () => programmer(false),
      );
    }
    canal.subscribe();

    // Rafraîchissement de secours : couvre les coupures de réseau et le cas
    // où le canal temps réel a été perdu sans qu'on le sache.
    const secours = setInterval(() => programmer(false), secoursMs);

    // Au retour sur l'onglet ou du réseau, on se resynchronise tout de suite.
    const auReveil = () => programmer(true);
    window.addEventListener("online", auReveil);
    document.addEventListener("visibilitychange", auReveil);

    return () => {
      vivant = false;
      if (minuteur !== null) clearTimeout(minuteur);
      clearInterval(secours);
      window.removeEventListener("online", auReveil);
      document.removeEventListener("visibilitychange", auReveil);
      void client.removeChannel(canal);
    };
  }, [gameId, secoursMs, ecouterJoueurs]);
}
