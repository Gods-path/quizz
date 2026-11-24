/**
 * Client Supabase du navigateur, avec la cle PUBLIQUE.
 *
 * Il ne sert qu'a UNE chose : ecouter en direct les deux tables publiques
 * (games et players) via Supabase Realtime. Il ne peut rien ecrire : les
 * regles de securite (RLS) n'autorisent que la lecture de ces deux tables.
 */

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Configuration Supabase manquante : vérifiez NEXT_PUBLIC_SUPABASE_URL " +
        "et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}
