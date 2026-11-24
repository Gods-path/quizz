import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { expect } from "./verifier.ts";
import {
  buildCsv,
  buildTemplateCsv,
  csvField,
  parseQuizCsv,
} from "../lib/csv.ts";
import { computeQuizDurations } from "../lib/durations.ts";

const HEADER =
  "theme,domaine,question,reponse_A,reponse_B,reponse_C,reponse_D,bonnes_reponses,duree_secondes,explication";

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\n");
}

describe("fichier correct", () => {
  it("lit une question simple", () => {
    const { questions, errors } = parseQuizCsv(
      csv("Thème,Domaine,Capitale ?,Douala,Yaoundé,Garoua,Bafoussam,B,60,Explication"),
    );
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(1);
    const question = questions[0];
    expect(question.text).toBe("Capitale ?");
    expect(question.options).toHaveLength(4);
    expect(question.options[1]).toEqual({ letter: "B", text: "Yaoundé" });
    expect(question.correctLetters).toEqual(["B"]);
    expect(question.theme).toBe("Thème");
    expect(question.explanation).toBe("Explication");
    expect(question.line).toBe(2);
  });

  it("lit plusieurs bonnes réponses séparées par un point-virgule", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Lesquels sont des tableurs ?,Excel,Sheets,Photoshop,VLC,A;B,,"),
    );
    expect(errors).toEqual([]);
    expect(questions[0].correctLetters).toEqual(["A", "B"]);
  });

  it("accepte une question à 2 choix (C et D vides)", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Le soleil se lève à l'ouest.,Vrai,Faux,,,B,,"),
    );
    expect(errors).toEqual([]);
    expect(questions[0].options).toHaveLength(2);
  });

  it("accepte une question à 3 choix (D vide)", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Combien de couleurs ?,Une,Deux,Trois,,C,,"),
    );
    expect(errors).toEqual([]);
    expect(questions[0].options).toHaveLength(3);
  });

  it("ignore les lignes vides", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Question 1,A,B,,,A,,", "", ",,,,,,,,,", ",,Question 2,A,B,,,B,,"),
    );
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(2);
  });
});

describe("tolérances de format", () => {
  it("accepte le point-virgule comme séparateur (Excel en français)", () => {
    const contenu = [
      HEADER.replace(/,/g, ";"),
      ";;Capitale ?;Douala;Yaoundé;;;B;;",
    ].join("\n");
    const { questions, errors } = parseQuizCsv(contenu);
    expect(errors).toEqual([]);
    expect(questions[0].options[1].text).toBe("Yaoundé");
  });

  it("accepte le BOM en tête de fichier", () => {
    const { questions, errors } = parseQuizCsv(
      "﻿" + csv(",,Capitale ?,Douala,Yaoundé,,,B,,"),
    );
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(1);
  });

  it("accepte les en-têtes accentués ou en majuscules", () => {
    const contenu = [
      "Thème,Domaine,Question,Réponse_A,Réponse_B,Réponse_C,Réponse_D,Bonnes_Reponses,Duree_Secondes,Explication",
      ",,Capitale ?,Douala,Yaoundé,,,B,,",
    ].join("\n");
    const { questions, errors } = parseQuizCsv(contenu);
    expect(errors).toEqual([]);
    expect(questions[0].correctLetters).toEqual(["B"]);
  });

  it("garde les virgules et les guillemets français dans le texte", () => {
    const { questions, errors } = parseQuizCsv(
      csv(
        ',,"Une couturière écrit : « Fais-moi une pub, vite », que faire ?","Ajouter rôle, contexte et ton",Rien,,,A,,',
      ),
    );
    expect(errors).toEqual([]);
    expect(questions[0].text).toBe(
      "Une couturière écrit : « Fais-moi une pub, vite », que faire ?",
    );
    expect(questions[0].options[0].text).toBe("Ajouter rôle, contexte et ton");
  });

  it("gère les guillemets doublés à l'intérieur d'un champ", () => {
    const { questions, errors } = parseQuizCsv(
      csv(',,"Il dit ""bonjour"" puis part.",Oui,Non,,,A,,'),
    );
    expect(errors).toEqual([]);
    expect(questions[0].text).toBe('Il dit "bonjour" puis part.');
  });

  it("accepte le séparateur , ou ; dans la colonne bonnes_reponses", () => {
    const { questions } = parseQuizCsv(
      csv(',,Question ?,A1,B1,C1,D1,"A,C",,'),
    );
    expect(questions[0].correctLetters).toEqual(["A", "C"]);
  });

  it("donne le bon numéro de ligne même avec un retour à la ligne dans un champ", () => {
    const contenu = csv(
      ',,"Question sur\ndeux lignes",A1,B1,,,A,,',
      ",,Deuxième question,A2,B2,,,Z,,",
    );
    const { errors } = parseQuizCsv(contenu);
    // la 2e question commence à la ligne 4 du fichier (1 en-tête + 2 lignes)
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Ligne 4 :");
  });
});

describe("messages d'erreur ligne par ligne", () => {
  it("signale une bonne réponse qui n'existe pas", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Capitale ?,Douala,Yaoundé,Garoua,Bafoussam,E,,"),
    );
    expect(questions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      'Ligne 2 : la bonne réponse « E » n\'existe pas. Utilisez A, B, C ou D.',
    );
  });

  it("signale une bonne réponse qui renvoie à une proposition vide", () => {
    const { errors } = parseQuizCsv(csv(",,Capitale ?,Douala,Yaoundé,,,C,,"));
    expect(errors[0]).toBe(
      "Ligne 2 : la bonne réponse « C » renvoie à une proposition vide.",
    );
  });

  it("signale une question vide", () => {
    const { errors } = parseQuizCsv(csv(",,,Douala,Yaoundé,,,B,,"));
    expect(errors[0]).toContain("Ligne 2 :");
    expect(errors[0]).toContain("« question » est obligatoire");
  });

  it("signale une réponse A ou B manquante", () => {
    const { errors } = parseQuizCsv(csv(",,Capitale ?,Douala,,,,A,,"));
    expect(errors.some((e) => e.includes("« reponse_B » est obligatoire"))).toBe(
      true,
    );
  });

  it("signale la colonne bonnes_reponses vide", () => {
    const { errors } = parseQuizCsv(csv(",,Capitale ?,Douala,Yaoundé,,,,,"));
    expect(errors[0]).toContain("« bonnes_reponses » est obligatoire");
  });

  it("signale un trou dans les propositions (C vide mais D remplie)", () => {
    const { errors } = parseQuizCsv(csv(",,Capitale ?,Douala,Yaoundé,,Garoua,B,,"));
    expect(errors[0]).toContain("la réponse C est vide alors que la réponse D");
  });

  it("signale toutes les propositions marquées comme bonnes", () => {
    const { errors } = parseQuizCsv(csv(",,Question ?,A1,B1,,,A;B,,"));
    expect(errors[0]).toContain("toutes les propositions");
  });

  it("donne TOUTES les erreurs d'un coup, avec le bon numéro de ligne", () => {
    const { questions, errors } = parseQuizCsv(
      csv(
        ",,Bonne question,A1,B1,,,A,,",
        ",,Question sans bonne réponse,A2,B2,,,,,",
        ",,Question avec lettre fausse,A3,B3,,,E,,",
        ",,,A4,B4,,,A,,",
      ),
    );
    expect(questions).toHaveLength(1);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain("Ligne 3 :");
    expect(errors[1]).toContain("Ligne 4 :");
    expect(errors[2]).toContain("Ligne 5 :");
  });

  it("signale une colonne obligatoire absente du fichier", () => {
    const { errors } = parseQuizCsv("question,reponse_A\nCapitale ?,Douala");
    expect(errors[0]).toContain("Ligne 1 :");
    expect(errors[0]).toContain("« reponse_b »");
    expect(errors[0]).toContain("« bonnes_reponses »");
  });

  it("signale un fichier vide", () => {
    expect(parseQuizCsv("").errors).toEqual(["Le fichier est vide."]);
    expect(parseQuizCsv("   \n  ").errors).toEqual(["Le fichier est vide."]);
  });

  it("signale un fichier sans aucune question", () => {
    expect(parseQuizCsv(HEADER).errors).toEqual([
      "Aucune question trouvée dans le fichier.",
    ]);
  });

  it("refuse une question trop longue pour le vidéoprojecteur", () => {
    const { errors } = parseQuizCsv(
      csv(`,,${"Q".repeat(401)},A1,B1,,,A,,`),
    );
    expect(errors[0]).toContain("la question fait 401 caractères");
  });
});

describe("colonne duree_secondes", () => {
  it("est ignorée par défaut", () => {
    const { questions, errors } = parseQuizCsv(
      csv(",,Question ?,A1,B1,,,A,abc,"),
    );
    expect(errors).toEqual([]);
    expect(questions[0].fileDurationSeconds).toBeNull();
  });

  it("est validée quand on choisit de l'utiliser", () => {
    const { errors } = parseQuizCsv(csv(",,Question ?,A1,B1,,,A,abc,"), {
      useFileDurations: true,
    });
    expect(errors[0]).toContain("la durée « abc » n'est pas un nombre");
  });

  it("refuse une durée manquante quand on choisit de l'utiliser", () => {
    const { errors } = parseQuizCsv(csv(",,Question ?,A1,B1,,,A,,"), {
      useFileDurations: true,
    });
    expect(errors[0]).toContain("« duree_secondes » est vide");
  });
});

describe("écriture de CSV", () => {
  it("met entre guillemets les champs qui en ont besoin", () => {
    expect(csvField("simple")).toBe("simple");
    expect(csvField("avec, virgule")).toBe('"avec, virgule"');
    expect(csvField('avec "guillemets"')).toBe('"avec ""guillemets"""');
    expect(csvField(null)).toBe("");
  });

  it("ajoute le BOM pour qu'Excel affiche les accents", () => {
    expect(buildCsv([["é"]]).startsWith("﻿")).toBe(true);
  });

  it("produit un modèle relisible par l'application", () => {
    const { questions, errors } = parseQuizCsv(buildTemplateCsv());
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(3);
    expect(questions[1].correctLetters).toEqual(["A", "B"]);
    expect(questions[2].options).toHaveLength(2);
  });
});

describe("le vrai fichier du module 01", () => {
  const file = path.join(process.cwd(), "questions_ccaof_module01.csv");

  it("se lit sans aucune erreur", () => {
    const contenu = fs.readFileSync(file, "utf8");
    const { questions, errors } = parseQuizCsv(contenu);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(30);
  });

  it("contient 4 questions à plusieurs bonnes réponses", () => {
    const { questions } = parseQuizCsv(fs.readFileSync(file, "utf8"));
    const multiples = questions.filter((q) => q.correctLetters.length > 1);
    expect(multiples).toHaveLength(4);
  });

  it("garde les accents et les guillemets français", () => {
    const { questions } = parseQuizCsv(fs.readFileSync(file, "utf8"));
    expect(questions[0].text).toContain("couturière");
    expect(questions[0].text).toContain("«");
  });

  it("se répartit exactement sur 45 minutes", () => {
    const { questions } = parseQuizCsv(fs.readFileSync(file, "utf8"));
    const durees = computeQuizDurations(questions, 45);
    expect(durees.reduce((a, b) => a + b, 0)).toBe(45 * 60);
    expect(Math.min(...durees)).toBeGreaterThanOrEqual(15);
  });
});
