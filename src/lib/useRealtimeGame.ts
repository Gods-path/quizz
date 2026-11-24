"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "./supabase-browser.ts";

/**
 * Écoute en direct les changements de la partie.
 *
 * Deux tables seulement sont écoutées — `games` (la phase, la question en
 * cours, les compteurs) et `players` (qui arrive, les scores) — parce que
 * ce sont les deux seules que le navigateur a le droit de lire. Les
 * questions et les réponses ne passent jamais par là.
 *
 * Un rafraîchissement de secours toutes les 4 secondes couvre les
 * coupures de réseau : en 3G, mieux vaut une seconde de retard qu'un
 * écran bloqué.
 */
export function useRealtimeGame(
  gameId: string | null,
  onChange: () => void,
  secoursMs = 4000,
): void {
  const rappel = useRef(onChange);
  rappel.current = onChange;

  useEffect(() => {
    if (!gameId) return;

    let vivant = true;
    const declencher = () => {
      if (vivant) rappel.current();
    };

    const client = supabaseBrowser();
    const canal = client
      .channel(`partie-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        declencher,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `game_id=eq.${gameId}`,
        },
        declencher,
      )
      .subscribe();

    const secours = setInterval(declencher, secoursMs);

    // Au retour sur l'onglet ou du réseau, on se resynchronise tout de suite.
    const auReveil = () => declencher();
    window.addEventListener("online", auReveil);
    document.addEventListener("visibilitychange", auReveil);

    return () => {
      vivant = false;
      clearInterval(secours);
      window.removeEventListener("online", auReveil);
      document.removeEventListener("visibilitychange", auReveil);
      void client.removeChannel(canal);
    };
  }, [gameId, secoursMs]);
}
