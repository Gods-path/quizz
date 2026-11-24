/**
 * Importe le quiz d'exemple : « Claude Module 01 – CCAO-F », 45 minutes,
 * à partir du fichier questions_ccaof_module01.csv du dossier.
 *
 * Utilisation :  npm run dev   (dans un terminal)
 *                npm run seed
 */

import fs from "node:fs";
import path from "node:path";
import { BASE, creerClient, verifierServeur } from "./commun.mjs";

const TITRE = "Claude Module 01 – CCAO-F";
const MINUTES = 45;
const FICHIER = "questions_ccaof_module01.csv";

async function main() {
  await verifierServeur();

  const chemin = path.join(process.cwd(), FICHIER);
  if (!fs.existsSync(chemin)) {
    throw new Error(
      `Fichier ${FICHIER} introuvable dans ${process.cwd()}.\n` +
        `Placez-le à la racine du projet, à côté de package.json.`,
    );
  }

  const client = creerClient();
  await client.connexionFormateur();

  // Si le quiz existe déjà, on ne le crée pas en double.
  const liste = await client.appel("/api/quiz");
  if (!liste.ok) {
    throw new Error(`Lecture de la bibliothèque impossible : ${liste.corps.erreur}`);
  }
  const deja = (liste.corps.quiz ?? []).find((quiz) => quiz.title === TITRE);
  if (deja) {
    console.log(
      `ℹ️  « ${TITRE} » est déjà dans la bibliothèque ` +
        `(${deja.question_count} questions, ${deja.total_duration_minutes} min).`,
    );
    console.log(`   Ouvrez ${BASE}/formateur pour lancer une partie.`);
    return;
  }

  const csv = fs.readFileSync(chemin, "utf8");
  const creation = await client.appel("/api/quiz", {
    method: "POST",
    body: { csv, title: TITRE, totalMinutes: MINUTES },
  });

  if (!creation.ok) {
    const details = Array.isArray(creation.corps.details)
      ? `\n   - ${creation.corps.details.join("\n   - ")}`
      : "";
    throw new Error(`${creation.corps.erreur ?? "Import impossible."}${details}`);
  }

  const minutes = Math.round(creation.corps.dureeTotaleSecondes / 60);
  console.log(`✅ « ${creation.corps.titre} » importé.`);
  console.log(
    `   ${creation.corps.questions} questions, ` +
      `${creation.corps.dureeTotaleSecondes} s au total (${minutes} minutes pile).`,
  );
  console.log(`\n   Ouvrez ${BASE}/formateur pour lancer une partie.`);
}

main().catch((erreur) => {
  console.error(`\n💥 ${erreur.message}`);
  process.exit(1);
});
