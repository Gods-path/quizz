/**
 * Deux vérifications qu'on ne peut faire qu'en se mettant à la place du
 * navigateur d'un apprenant, avec la CLÉ PUBLIQUE :
 *
 *   1. ÉTANCHÉITÉ : les questions, les bonnes réponses, les réponses des
 *      autres et les jetons sont-ils réellement hors de portée ?
 *   2. DIRECT : Supabase Realtime diffuse-t-il bien les deux tables
 *      publiques ? (sans cela, l'écran ne tiendrait que grâce au
 *      rafraîchissement de secours, ce qui masquerait la panne)
 *
 * Utilisation :  npm run dev   (dans un terminal)
 *                npm run verifier
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { creerClient, creerVerificateur, verifierServeur } from "./commun.mjs";

const { verifier, bilan } = creerVerificateur();

/** Lit une valeur de .env.local sans jamais l'afficher. */
function lireEnv(nom) {
  const chemin = path.join(process.cwd(), ".env.local");
  const contenu = fs.readFileSync(chemin, "utf8");
  for (const ligne of contenu.split(/\r?\n/)) {
    const propre = ligne.trim();
    if (propre.startsWith("#")) continue;
    const coupure = propre.indexOf("=");
    if (coupure === -1) continue;
    if (propre.slice(0, coupure).trim() === nom) return propre.slice(coupure + 1).trim();
  }
  throw new Error(`${nom} est absent de .env.local`);
}

async function main() {
  await verifierServeur();

  const url = lireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const clePublique = lireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  // Exactement le client que le téléphone d'un apprenant utilise.
  const navigateur = createClient(url, clePublique, {
    auth: { persistSession: false },
  });

  // ------------------------------------------------------ 1. étanchéité
  console.log("\n1. Ce qu'un apprenant curieux peut lire avec la clé publique\n");

  const interdites = ["questions", "answers", "player_secrets", "quizzes"];
  for (const table of interdites) {
    const { data, error } = await navigateur.from(table).select("*").limit(5);
    const bloque = Boolean(error) || (data ?? []).length === 0;
    verifier(
      `« ${table} » est inaccessible`,
      bloque,
      error ? `refusé : ${error.message}` : `ATTENTION : ${data?.length} ligne(s) lues !`,
    );
  }

  const autorisees = ["games", "players"];
  for (const table of autorisees) {
    const { error } = await navigateur.from(table).select("*").limit(1);
    verifier(`« ${table} » est lisible (nécessaire au direct)`, !error, error?.message);
  }

  // Et aucune écriture, nulle part : on tente vraiment de se donner des
  // points, puis on relit pour voir si ça a pris.
  const { data: avant } = await navigateur.from("players").select("id, score").limit(1);
  if (avant?.length) {
    await navigateur.from("players").update({ score: 999999 }).eq("id", avant[0].id);
    const { data: apres } = await navigateur
      .from("players")
      .select("score")
      .eq("id", avant[0].id)
      .maybeSingle();
    verifier(
      "un score ne peut pas être modifié depuis le navigateur",
      apres?.score !== 999999,
      `score après tentative : ${apres?.score}`,
    );
  }

  // --------------------------------------------------------- 2. le direct
  console.log("\n2. Supabase Realtime\n");

  const formateur = creerClient();
  await formateur.connexionFormateur();

  const liste = await formateur.appel("/api/quiz");
  const quiz = (liste.corps.quiz ?? []).find((q) => q.question_count > 0);
  if (!quiz) throw new Error("Aucun quiz dans la bibliothèque : lancez « npm run seed ».");

  const creation = await formateur.appel("/api/game", {
    method: "POST",
    body: { quizId: quiz.id, passThreshold: 72, mockMode: true },
  });
  if (!creation.ok) throw new Error(`Création de partie impossible : ${creation.corps.erreur}`);
  const partie = creation.corps.partie;

  const evenements = [];
  const canal = navigateur
    .channel(`verification-${partie.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${partie.id}` },
      (message) => evenements.push({ table: "games", type: message.eventType }),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `game_id=eq.${partie.id}` },
      (message) => evenements.push({ table: "players", type: message.eventType }),
    );

  const abonne = await new Promise((resoudre) => {
    const fin = setTimeout(() => resoudre("timeout"), 15000);
    canal.subscribe((statut) => {
      if (statut === "SUBSCRIBED") {
        clearTimeout(fin);
        resoudre("ok");
      }
    });
  });
  verifier("l'abonnement au direct est accepté", abonne === "ok", abonne);

  // Un joueur arrive : l'écran formateur doit l'apprendre par Realtime.
  await fetch(`${process.env.QUIZ_URL ?? "http://localhost:3000"}/api/player/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Témoin", code: partie.code }),
  });

  // Attente adaptative : on sort dès que les deux événements sont là, mais
  // on patiente jusqu'à 20 s. Une attente fixe donnait un faux négatif quand
  // le serveur était chargé — un test qui ment est pire que pas de test.
  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    const vuJoueurs = evenements.some((e) => e.table === "players");
    const vuParties = evenements.some((e) => e.table === "games");
    if (vuJoueurs && vuParties) break;
    await new Promise((resoudre) => setTimeout(resoudre, 500));
  }

  verifier(
    "l'arrivée d'un joueur est diffusée en direct (table players)",
    evenements.some((e) => e.table === "players"),
    `événements reçus : ${JSON.stringify(evenements)}`,
  );
  verifier(
    "le changement d'état de la partie est diffusé (table games)",
    evenements.some((e) => e.table === "games"),
    `événements reçus : ${JSON.stringify(evenements)}`,
  );

  await navigateur.removeChannel(canal);
  await formateur.appel(`/api/game/${partie.id}/end`, { method: "POST" });

  console.log(
    `\n   (partie de test ${partie.code} terminée ; vous pouvez l'ignorer dans l'historique)`,
  );

  return bilan();
}

main()
  .then((succes) => process.exit(succes ? 0 : 1))
  .catch((erreur) => {
    console.error(`\n💥 ${erreur.message}`);
    process.exit(1);
  });
