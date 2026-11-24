/**
 * Client Supabase AVEC LA CLE SECRETE.
 *
 * Ce fichier ne doit JAMAIS etre importe par un composant du navigateur.
 * Le garde ci-dessous leve une erreur si cela arrive par accident, et comme
 * SUPABASE_SECRET_KEY n'a pas le prefixe NEXT_PUBLIC_, Next.js ne l'inclut
 * de toute facon jamais dans le code envoye au telephone.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class ConfigError extends Error {}

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabase-admin ne doit pas être utilisé dans le navigateur : " +
        "la clé secrète resterait exposée.",
    );
  }
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new ConfigError(
      "NEXT_PUBLIC_SUPABASE_URL n'est pas défini. Copiez .env.example vers " +
        ".env.local et remplissez-le (voir le README).",
    );
  }
  if (!secret) {
    throw new ConfigError(
      "SUPABASE_SECRET_KEY n'est pas défini. Allez dans Supabase > Project " +
        "Settings > API Keys, copiez la clé « secret » et collez-la dans .env.local.",
    );
  }

  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "quiz-direct/1.0" } },
  });
  return cached;
}
