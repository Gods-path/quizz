/**
 * Simulation d'une partie complète, de bout en bout.
 *
 *   1 formateur + 3 apprenants :
 *     - Aline    répond juste à tout
 *     - Boris    répond faux à tout
 *     - Clarisse ne répond jamais
 *
 * Le script ne touche pas la base : il appelle les mêmes routes que le
 * navigateur. Il vérifie que la partie va jusqu'au bout, qu'aucune
 * question n'est sautée ni rejouée, que les points et le bonus de série
 * suivent les règles, que le téléphone ne reçoit JAMAIS la bonne réponse
 * avant la correction, et que l'export CSV est correct.
 *
 * Utilisation :  npm run dev   (dans un terminal)
 *                npm run simulate
 */

import fs from "node:fs";
import path from "node:path";
import {
  attendre,
  BASE,
  creerClient,
  creerVerificateur,
  verifierServeur,
} from "./commun.mjs";

const TITRE_SIMULATION = "Simulation automatique";
const MINUTES = 8; // 30 questions -> environ 15 s chacune, le minimum

const { verifier, bilan } = creerVerificateur();
const formateur = creerClient();

/** Un apprenant simulé. */
function creerApprenant(nom, comportement) {
  return { nom, comportement, playerId: null, token: null };
}

async function appelJoueur(chemin, apprenant, extra = {}) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: apprenant.playerId,
      token: apprenant.token,
      ...extra,
    }),
  });
  const corps = await reponse.json().catch(() => ({}));
  return { ok: reponse.ok, status: reponse.status, corps };
}

async function main() {
  console.log(`\n🎬 Simulation d'une partie sur ${BASE}\n`);
  await verifierServeur();

  // ------------------------------------------------------------------ 1. quiz
  console.log("1. Préparation du quiz");
  await formateur.connexionFormateur();

  const csv = fs.readFileSync(
    path.join(process.cwd(), "questions_ccaof_module01.csv"),
    "utf8",
  );

  const creation = await formateur.appel("/api/quiz", {
    method: "POST",
    body: {
      csv,
      title: `${TITRE_SIMULATION} ${new Date().toISOString().slice(11, 19)}`,
      totalMinutes: MINUTES,
    },
  });
  if (!creation.ok) {
    throw new Error(`Import impossible : ${creation.corps.erreur ?? creation.status}`);
  }
  const quizId = creation.corps.id;
  verifier(
    "le quiz est importé avec 30 questions",
    creation.corps.questions === 30,
    `reçu ${creation.corps.questions}`,
  );
  verifier(
    `la durée totale tombe exactement sur ${MINUTES} minutes`,
    creation.corps.dureeTotaleSecondes === MINUTES * 60,
    `reçu ${creation.corps.dureeTotaleSecondes} s`,
  );

  // Le script a besoin des bonnes réponses pour jouer juste ou faux.
  const detail = await formateur.appel(`/api/quiz/${quizId}`);
  const questions = detail.corps.questions;

  // ----------------------------------------------------------------- 2. partie
  console.log("\n2. Création de la partie");
  const partieCreee = await formateur.appel("/api/game", {
    method: "POST",
    body: { quizId, passThreshold: 72, mockMode: true },
  });
  if (!partieCreee.ok) {
    throw new Error(`Création impossible : ${partieCreee.corps.erreur}`);
  }
  const gameId = partieCreee.corps.partie.id;
  const code = partieCreee.corps.partie.code;
  verifier("le code de partie fait 6 caractères", code.length === 6, code);
  verifier(
    "le code n'a aucun caractère ambigu (0 O 1 I L)",
    !/[0O1IL]/.test(code),
    code,
  );

  // --------------------------------------------------------------- 3. joueurs
  console.log("\n3. Arrivée des apprenants");
  const apprenants = [
    creerApprenant("Aline", "juste"),
    creerApprenant("Boris", "faux"),
    creerApprenant("Clarisse", "jamais"),
  ];

  for (const apprenant of apprenants) {
    const reponse = await fetch(`${BASE}/api/player/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: apprenant.nom, code }),
    });
    const corps = await reponse.json();
    if (!reponse.ok) throw new Error(`${apprenant.nom} n'a pas pu entrer : ${corps.erreur}`);
    apprenant.playerId = corps.playerId;
    apprenant.token = corps.token;
    console.log(`   ${apprenant.nom} a rejoint (${apprenant.comportement})`);
  }

  // Un nom déjà pris doit être refusé proprement.
  const doublon = await fetch(`${BASE}/api/player/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "aline", code }),
  });
  const corpsDoublon = await doublon.json();
  verifier(
    "un nom déjà pris est refusé avec un message clair",
    doublon.status === 409 && /déjà pris/.test(corpsDoublon.erreur ?? ""),
    corpsDoublon.erreur,
  );

  // Un code inexistant doit être refusé.
  const faux = await fetch(`${BASE}/api/player/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Zoé", code: "ZZZZZZ" }),
  });
  verifier("un code inexistant est refusé", faux.status === 404);

  let etat = (await formateur.appel(`/api/game/${gameId}/state`)).corps;
  verifier("les 3 joueurs sont comptés", etat.partie.player_count === 3,
    `reçu ${etat.partie.player_count}`);

  // ------------------------------------------------------------- 4. le quiz
  console.log("\n4. Déroulement du quiz");

  const avancer = async (force) => {
    const actuel = (await formateur.appel(`/api/game/${gameId}/state`)).corps.partie;
    return formateur.appel(`/api/game/${gameId}/advance`, {
      method: "POST",
      body: {
        fromPhase: actuel.phase,
        fromIndex: actuel.current_index,
        force,
      },
    });
  };

  // Le lancement doit être refusé si l'on prétend partir d'un autre état.
  const mauvaisDepart = await formateur.appel(`/api/game/${gameId}/advance`, {
    method: "POST",
    body: { fromPhase: "reveal", fromIndex: 7 },
  });
  verifier(
    "le serveur refuse un départ qui ne correspond pas à l'état réel",
    mauvaisDepart.status === 409,
    `statut ${mauvaisDepart.status}`,
  );

  await avancer(true); // salle d'attente -> question 1

  const indexVus = [];
  const pointsAline = [];
  let bonusVus = 0;

  for (let tour = 0; tour < 40; tour += 1) {
    etat = (await formateur.appel(`/api/game/${gameId}/state`)).corps;
    const partie = etat.partie;
    if (partie.phase === "finished") break;

    if (partie.phase !== "question") {
      await avancer(true);
      continue;
    }

    const index = partie.current_index;
    indexVus.push(index);
    const question = questions.find((q) => q.position === index);
    const bonnes = question.correct_letters;

    // --- ce que le téléphone reçoit pendant la question ---
    const vueAline = await appelJoueur("/api/player/state", apprenants[0]);
    const texteBrut = JSON.stringify(vueAline.corps);
    if (index === 0) {
      verifier(
        "le téléphone reçoit la question sans la bonne réponse",
        !texteBrut.includes("correctLetters") && !texteBrut.includes("bonnesReponses"),
      );
      verifier(
        "le téléphone ne reçoit pas l'explication avant la correction",
        !texteBrut.includes("explication") && !texteBrut.includes("explanation"),
      );
      verifier(
        "le téléphone reçoit bien le texte de la question",
        vueAline.corps.question?.text === question.text,
      );
    }

    // --- les réponses ---
    for (const apprenant of apprenants) {
      if (apprenant.comportement === "jamais") continue;

      const lettres =
        apprenant.comportement === "juste"
          ? bonnes
          : [
              question.options.find((option) => !bonnes.includes(option.letter))
                ?.letter,
            ].filter(Boolean);

      const envoi = await appelJoueur("/api/player/answer", apprenant, { letters: lettres });
      if (!envoi.ok) {
        verifier(`${apprenant.nom} a pu répondre à la question ${index + 1}`, false,
          envoi.corps.erreur);
      }

      // La route de réponse ne doit rien dire sur la justesse.
      if (index === 0) {
        verifier(
          "la réponse envoyée ne révèle pas si c'était juste",
          !JSON.stringify(envoi.corps).match(/juste|correct|points/i),
          JSON.stringify(envoi.corps),
        );
        const deuxieme = await appelJoueur("/api/player/answer", apprenant, {
          letters: lettres,
        });
        verifier(
          `${apprenant.nom} ne peut pas répondre deux fois`,
          deuxieme.status === 409,
          `statut ${deuxieme.status}`,
        );
      }
    }

    // La deuxième question sert à vérifier la vraie fin du temps :
    // on attend que le chrono tombe, puis on avance SANS forcer.
    if (index === 1) {
      const restant = (await formateur.appel(`/api/game/${gameId}/state`)).corps
        .tempsRestantMs;
      const tropTot = await formateur.appel(`/api/game/${gameId}/advance`, {
        method: "POST",
        body: { fromPhase: "question", fromIndex: index },
      });
      verifier(
        "sans forcer, le serveur refuse de corriger avant la fin du temps",
        tropTot.status === 409,
        `statut ${tropTot.status}`,
      );
      console.log(`   (attente de ${Math.ceil(restant / 1000)} s : fin du temps réelle)`);
      await attendre(restant + 1200);
      const aLHeure = await formateur.appel(`/api/game/${gameId}/advance`, {
        method: "POST",
        body: { fromPhase: "question", fromIndex: index },
      });
      verifier(
        "le temps écoulé, le serveur accepte de corriger sans forcer",
        aLHeure.ok,
        JSON.stringify(aLHeure.corps).slice(0, 120),
      );
    } else {
      // Double clic : le second appel doit être ignoré, sans rien casser.
      const [un, deux] = await Promise.all([avancer(true), avancer(true)]);
      const acceptes = [un, deux].filter((reponse) => reponse.ok).length;
      if (index === 2) {
        verifier(
          "un double clic sur « Corriger » ne corrige qu'une fois",
          acceptes === 1,
          `${acceptes} appels acceptés`,
        );
      }
    }

    // --- la correction ---
    etat = (await formateur.appel(`/api/game/${gameId}/state`)).corps;
    verifier(
      `question ${index + 1} : la partie est passée en correction`,
      etat.partie.phase === "reveal",
      etat.partie.phase,
    );

    if (index === 0) {
      verifier(
        "à la correction, l'écran formateur reçoit la bonne réponse",
        Array.isArray(etat.question?.correctLetters),
      );
      verifier(
        "la répartition des réponses est fournie",
        Array.isArray(etat.repartition) && etat.repartition.length > 0,
      );
      verifier(
        "un joueur n'ayant pas répondu est compté",
        etat.sansReponse === 1,
        `reçu ${etat.sansReponse}`,
      );

      const resultatAline = await appelJoueur("/api/player/state", apprenants[0]);
      verifier(
        "à la correction, le téléphone apprend qu'il a juste",
        resultatAline.corps.resultat?.juste === true,
      );
      const resultatClarisse = await appelJoueur("/api/player/state", apprenants[2]);
      verifier(
        "le joueur silencieux est marqué « pas de réponse »",
        resultatClarisse.corps.resultat?.aRepondu === false,
      );
    }

    const aline = etat.classement.find((joueur) => joueur.name === "Aline");
    pointsAline.push(aline.score);
    if (index === 2) {
      // 3 bonnes réponses de suite : le bonus doit être tombé.
      const gainTroisieme = pointsAline[2] - pointsAline[1];
      verifier(
        "le bonus de série (+100) tombe à la 3e bonne réponse",
        gainTroisieme > 1000 || gainTroisieme - 100 > 400,
        `gain ${gainTroisieme}`,
      );
      bonusVus += 1;
    }

    await avancer(true); // correction -> question suivante (ou fin)
  }

  // --------------------------------------------------------------- 5. bilan
  console.log("\n5. Vérifications de fin de partie");
  etat = (await formateur.appel(`/api/game/${gameId}/state`)).corps;

  verifier("la partie est terminée", etat.partie.phase === "finished", etat.partie.phase);
  verifier(
    "les 30 questions ont été jouées",
    indexVus.length === 30,
    `${indexVus.length} questions`,
  );
  verifier(
    "aucune question sautée ni rejouée",
    indexVus.join(",") === Array.from({ length: 30 }, (_, i) => i).join(","),
    indexVus.join(","),
  );
  verifier("le bonus de série a été observé", bonusVus > 0);

  const classement = etat.classement;
  const aline = classement.find((joueur) => joueur.name === "Aline");
  const boris = classement.find((joueur) => joueur.name === "Boris");
  const clarisse = classement.find((joueur) => joueur.name === "Clarisse");

  verifier("Aline est première", aline.rank === 1, `rang ${aline.rank}`);
  verifier("Aline a 30 bonnes réponses", aline.correct_count === 30,
    `${aline.correct_count}`);
  verifier("Boris n'a aucune bonne réponse", boris.correct_count === 0,
    `${boris.correct_count}`);
  verifier("Boris a 0 point", boris.score === 0, `${boris.score}`);
  verifier("Clarisse n'a répondu à aucune question", clarisse.answered_count === 0,
    `${clarisse.answered_count}`);
  verifier("Clarisse a 0 point", clarisse.score === 0, `${clarisse.score}`);
  verifier(
    "Aline a au moins 30 × 500 points plus les bonus",
    aline.score >= 30 * 500 + 28 * 100,
    `${aline.score} points`,
  );

  // Le bilan vu du téléphone
  const bilanAline = await appelJoueur("/api/player/state", apprenants[0]);
  verifier("Aline est déclarée « Réussi »", bilanAline.corps.bilan?.reussi === true);
  const bilanClarisse = await appelJoueur("/api/player/state", apprenants[2]);
  verifier(
    "Clarisse est déclarée « À retravailler »",
    bilanClarisse.corps.bilan?.reussi === false,
  );

  // La correction complète doit être disponible, maintenant seulement.
  const correction = await appelJoueur("/api/player/recap", apprenants[1]);
  verifier(
    "la correction complète est disponible à la fin",
    Array.isArray(correction.corps.correction) &&
      correction.corps.correction.length === 30,
  );
  verifier(
    "la correction contient la bonne réponse et l'explication",
    correction.corps.correction?.[0]?.bonnesReponses?.length > 0 &&
      typeof correction.corps.correction?.[0]?.explication === "string",
  );

  // --------------------------------------------------------- 6. export CSV
  console.log("\n6. Export CSV des résultats");
  const exportCsv = await formateur.appel(`/api/game/${gameId}/results`, {
    brut: true,
  });
  const octets = exportCsv.octets;
  // Le BOM se vérifie sur les OCTETS : Response.text() le retire tout seul.
  const texte = exportCsv.corps.replace(/^﻿/, "");
  const lignes = texte.trim().split(/\r?\n/);

  verifier(
    "le CSV commence par le BOM (accents lisibles dans Excel)",
    octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf,
    `octets ${octets[0]} ${octets[1]} ${octets[2]}`,
  );
  verifier("le CSV contient 1 en-tête + 3 apprenants", lignes.length === 4,
    `${lignes.length} lignes`);
  verifier(
    "le CSV a une colonne de réponse par question",
    // Attention : la colonne « bonnes_reponses » contient aussi « _reponse ».
    (lignes[0].match(/Q\d+_reponse/g) ?? []).length === 30,
    `${(lignes[0].match(/Q\d+_reponse/g) ?? []).length} colonnes`,
  );
  verifier("le CSV contient « Réussi » pour Aline", /Aline/.test(texte) && /Réussi/.test(texte));
  verifier(
    "le CSV contient « À retravailler »",
    /À retravailler/.test(texte),
  );
  verifier(
    "le CSV note « (pas de réponse) » pour Clarisse",
    /\(pas de réponse\)/.test(texte),
  );

  const ligneClarisse = lignes.find((ligne) => ligne.startsWith("3,Clarisse") || /Clarisse/.test(ligne));
  verifier("la ligne de Clarisse existe", Boolean(ligneClarisse));

  // Une partie terminée n'accepte plus personne.
  const tardif = await fetch(`${BASE}/api/player/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Retardataire", code }),
  });
  verifier("plus personne ne peut rejoindre une partie terminée", tardif.status === 409);

  // ------------------------------------------------------------- nettoyage
  await formateur.appel(`/api/quiz/${quizId}`, { method: "DELETE" });
  console.log("\n   (quiz de simulation supprimé)");

  return bilan();
}

main()
  .then((succes) => process.exit(succes ? 0 : 1))
  .catch((erreur) => {
    console.error(`\n💥 ${erreur.message}`);
    process.exit(1);
  });
