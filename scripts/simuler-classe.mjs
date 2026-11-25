/**
 * Simulation d'une CLASSE ENTIÈRE, pour vérifier que l'application tient la
 * charge avant une vraie séance.
 *
 * La simulation habituelle (`npm run simulate`) joue une partie complète
 * avec 3 apprenants : elle vérifie les RÈGLES du jeu. Celle-ci en fait
 * jouer vingt ou cent d'un coup, et mesure le COÛT : combien de messages
 * temps réel chaque téléphone reçoit, et combien d'appels au serveur cela
 * représente pour la salle.
 *
 * C'est ce que ce script a permis de découvrir : la clôture d'une question
 * à 20 apprenants produisait 41 messages par téléphone, soit plus de 800
 * appels pour la salle. Le quiz se figeait sur la question 1.
 *
 * Utilisation :  npm run dev            (dans un terminal)
 *                npm run simuler-classe        -- 20 apprenants
 *                N=60 npm run simuler-classe   -- 60 apprenants
 *
 * Pour viser l'application déployée plutôt que votre machine :
 *                QUIZ_URL=https://mon-quiz.vercel.app npm run simuler-classe
 */

import { createClient } from "@supabase/supabase-js";
import {
  attendre,
  BASE,
  creerClient,
  creerVerificateur,
  lireEnv,
  verifierServeur,
} from "./commun.mjs";

const N = Number(process.env.N ?? 20);

/** Trois questions courtes : ce qui nous intéresse est la charge, pas le quiz. */
const CSV = [
  "question,reponse_A,reponse_B,reponse_C,reponse_D,bonnes_reponses",
  "Première question de charge ?,Un,Deux,Trois,Quatre,A",
  "Deuxième question de charge ?,Un,Deux,Trois,Quatre,B",
  "Troisième question de charge ?,Un,Deux,Trois,Quatre,C",
].join("\n");

const { verifier, bilan } = creerVerificateur();

async function main() {
  console.log(`\n👥 Simulation d'une classe de ${N} apprenants sur ${BASE}\n`);
  await verifierServeur();

  const formateur = creerClient();
  await formateur.connexionFormateur();

  // ------------------------------------------------------------ 1. la partie
  console.log("1. Préparation");
  const importation = await formateur.appel("/api/quiz", {
    method: "POST",
    body: { csv: CSV, title: `Charge ${new Date().toISOString().slice(11, 19)}`, totalMinutes: 2 },
  });
  if (!importation.ok) {
    throw new Error(`Import impossible : ${importation.corps.erreur ?? importation.status}`);
  }
  const quizId = importation.corps.id;

  const creation = await formateur.appel("/api/game", {
    method: "POST",
    body: { quizId },
  });
  if (!creation.ok) {
    throw new Error(`Création impossible : ${creation.corps.erreur ?? creation.status}`);
  }
  const gameId = creation.corps.partie.id;
  const code = creation.corps.partie.code;
  console.log(`  partie ${code}`);

  // ------------------------------------------------------- 2. tout le monde
  console.log("2. Arrivée des apprenants");
  const joueurs = [];
  for (let numero = 1; numero <= N; numero += 1) {
    const reponse = await fetch(`${BASE}/api/player/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: `Apprenant ${numero}` }),
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) {
      throw new Error(`Inscription ${numero} refusée : ${corps.erreur ?? reponse.status}`);
    }
    joueurs.push({ playerId: corps.playerId, token: corps.token });
  }
  verifier(`les ${N} apprenants sont inscrits`, joueurs.length === N);

  // -------------------------------------- 3. un téléphone témoin, à l'écoute
  // On s'abonne exactement comme le fait un téléphone, pour compter ce qu'il
  // reçoit. Sans cette mesure, on ne peut que supposer.
  const supabase = createClient(
    lireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    lireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
  let messagesPartie = 0;
  let messagesJoueurs = 0;
  const canal = supabase
    .channel(`charge-${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => { messagesPartie += 1; },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` },
      () => { messagesJoueurs += 1; },
    )
    .subscribe();
  await attendre(2500);

  // --------------------------------------------------- 4. la première question
  console.log("3. Première question");
  const lancement = await formateur.appel(`/api/game/${gameId}/advance`, {
    method: "POST",
    body: { fromPhase: "lobby", fromIndex: 0 },
  });
  verifier("la partie démarre", lancement.ok && lancement.corps.partie.phase === "question");

  messagesPartie = 0;
  messagesJoueurs = 0;
  const debutReponses = Date.now();

  // Par vagues de 5, et non les 20 d'un coup.
  //
  // Ce n'est pas pour ménager l'application : c'est pour ménager la liaison
  // internet de la machine qui lance le script. Vingt connexions TLS
  // simultanées vers l'Europe suffisent à saturer une box ou un partage de
  // connexion mobile, et l'on mesure alors le réseau du testeur au lieu de
  // mesurer le quiz. En vrai, les téléphones passent par Vercel, chacun par
  // sa propre connexion : la situation est bien moins exigeante que celle-ci.
  const VAGUE = 5;
  const reponses = [];
  for (let debut = 0; debut < joueurs.length; debut += VAGUE) {
    const vague = joueurs.slice(debut, debut + VAGUE);
    reponses.push(
      ...(await Promise.all(
        vague.map((joueur) =>
          fetch(`${BASE}/api/player/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: joueur.playerId, token: joueur.token, letters: ["A"] }),
          })
            .then(async (reponse) => ({ ok: reponse.ok, corps: await reponse.json().catch(() => ({})) }))
            .catch((erreur) => ({ ok: false, corps: { erreur: erreur.message } })),
        ),
      )),
    );
  }
  const dureeReponses = Date.now() - debutReponses;
  const acceptees = reponses.filter((reponse) => reponse.ok).length;
  verifier(`les ${N} réponses simultanées sont acceptées`, acceptees === N,
    `${acceptees} acceptées — ${JSON.stringify(reponses.find((r) => !r.ok)?.corps ?? {})}`);
  console.log(`  ${N} réponses en ${dureeReponses} ms (${Math.round(dureeReponses / N)} ms par apprenant)`);

  await attendre(2000);
  const pendantReponses = messagesPartie + messagesJoueurs;

  // ------------------------------------------------------------ 5. correction
  console.log("4. Correction");
  messagesPartie = 0;
  messagesJoueurs = 0;
  const debutCloture = Date.now();
  const cloture = await formateur.appel(`/api/game/${gameId}/advance`, {
    method: "POST",
    body: { fromPhase: "question", fromIndex: 0 },
  });
  const dureeCloture = Date.now() - debutCloture;
  verifier("la question passe en correction", cloture.ok && cloture.corps.partie.phase === "reveal");
  console.log(`  clôture en ${dureeCloture} ms`);
  verifier(
    "la clôture reste loin de la limite de temps de Vercel (10 s)",
    dureeCloture < 8000,
    `${dureeCloture} ms`,
  );

  await attendre(3000);
  const pendantCloture = messagesPartie + messagesJoueurs;

  // ------------------------------------------------- 6. la question suivante
  console.log("5. Question suivante");
  const suite = await formateur.appel(`/api/game/${gameId}/advance`, {
    method: "POST",
    body: { fromPhase: "reveal", fromIndex: 0 },
  });
  verifier(
    "la partie passe bien à la question 2",
    suite.ok && suite.corps.partie.phase === "question" && suite.corps.partie.current_index === 1,
    `phase=${suite.corps?.partie?.phase} index=${suite.corps?.partie?.current_index}`,
  );

  const etat = await formateur.appel(`/api/game/${gameId}/state`, { cache: "no-store" });
  verifier(
    "tous les apprenants ont été notés",
    etat.corps.classement.length === N && etat.corps.classement.every((place) => place.score > 0),
    `${etat.corps.classement.filter((p) => p.score > 0).length}/${N} ont des points`,
  );

  // --------------------------------------------------------------- 7. bilan
  console.log("\n6. Coût mesuré, du point de vue d'UN téléphone");
  console.log(`  pendant que la classe répond : ${pendantReponses} messages temps réel`);
  console.log(`  pendant la correction        : ${pendantCloture} messages temps réel`);

  // Un message reçu ne coûte un appel au serveur que s'il annonce un
  // changement de phase. C'est tout l'objet du regroupement fait dans
  // useRealtimeGame : voir le commentaire en tête de ce fichier.
  verifier(
    "la correction ne provoque pas une avalanche de messages",
    pendantCloture <= N + 5,
    `${pendantCloture} messages pour ${N} apprenants`,
  );

  // ------------------------------------------------------------ 8. nettoyage
  await supabase.removeChannel(canal);
  await formateur.appel(`/api/game/${gameId}`, { method: "DELETE" });
  await formateur.appel(`/api/quiz/${quizId}`, { method: "DELETE" });
  console.log("\n   (partie et quiz de simulation supprimés)");

  process.exit(bilan() ? 0 : 1);
}

main().catch((erreur) => {
  console.error(`\n❌ ${erreur.message}`);
  process.exit(1);
});
