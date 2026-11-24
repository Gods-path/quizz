/**
 * Lecture et validation du fichier CSV des questions.
 *
 * Tolerances voulues :
 *   - UTF-8 avec ou sans BOM ;
 *   - separateur virgule OU point-virgule (Excel en francais) ;
 *   - guillemets, virgules dans le texte, retours a la ligne dans un champ ;
 *   - en-tetes avec ou sans accents, en majuscules ou minuscules.
 *
 * Chaque probleme est signale avec SON NUMERO DE LIGNE DANS LE FICHIER,
 * et toutes les erreurs sont renvoyees d'un coup (pas seulement la premiere).
 */

import Papa from "papaparse";
import { LETTERS, type Letter, type ParsedQuestion, type QuestionOption } from "./types.ts";

export const CSV_HEADERS = [
  "theme",
  "domaine",
  "question",
  "reponse_A",
  "reponse_B",
  "reponse_C",
  "reponse_D",
  "bonnes_reponses",
  "duree_secondes",
  "explication",
] as const;

const REQUIRED_HEADERS = ["question", "reponse_a", "reponse_b", "bonnes_reponses"];

export const MAX_QUESTION_CHARS = 400;
export const MAX_OPTION_CHARS = 180;
export const MAX_EXPLANATION_CHARS = 600;
export const MAX_TAG_CHARS = 80;

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: string[];
}

/** Retire le BOM et uniformise les fins de ligne. */
function stripBom(text: string): string {
  return text.replace(/^﻿/, "");
}

/**
 * Numero de la premiere ligne de chaque enregistrement CSV, en tenant
 * compte des retours a la ligne a l'interieur des champs entre guillemets.
 */
function recordStartLines(text: string): number[] {
  const starts: number[] = [];
  let line = 1;
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!started) {
      starts.push(line);
      started = true;
    }
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') i += 1;
        else inQuotes = false;
      } else if (char === "\n") {
        line += 1;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === "\n") {
      line += 1;
      started = false;
    }
  }
  return starts;
}

/** « Réponse_A » et « reponse_a » designent la meme colonne. */
function normalizeHeader(header: string): string {
  return stripBom(header)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Nettoie un texte affiche : espaces, caracteres de controle. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] += 1;
  }
  const best = (Object.keys(counts) as ("," | ";" | "\t")[]).sort(
    (a, b) => counts[b] - counts[a],
  )[0];
  return counts[best] > 0 ? best : ",";
}

export function parseQuizCsv(
  rawContent: string,
  options: { useFileDurations?: boolean } = {},
): ParseResult {
  const errors: string[] = [];
  const content = stripBom(rawContent).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (content.trim() === "") {
    return { questions: [], errors: ["Le fichier est vide."] };
  }

  const delimiter = detectDelimiter(content.split("\n")[0] ?? "");
  const starts = recordStartLines(content);

  const parsed = Papa.parse<string[]>(content, {
    delimiter,
    header: false,
    skipEmptyLines: false,
    quoteChar: '"',
    escapeChar: '"',
  });

  const rows = parsed.data.filter(Array.isArray);
  if (rows.length === 0) {
    return { questions: [], errors: ["Le fichier est vide."] };
  }

  // --- En-tetes --------------------------------------------------------
  const headers = (rows[0] ?? []).map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((name) => !headers.includes(name));
  if (missing.length > 0) {
    const liste = missing.map((name) => `« ${name} »`).join(", ");
    errors.push(
      `Ligne 1 : colonne${missing.length > 1 ? "s" : ""} manquante${missing.length > 1 ? "s" : ""} : ${liste}. ` +
        `Les en-têtes attendus sont : ${CSV_HEADERS.join(",")}`,
    );
    return { questions: [], errors };
  }

  const columnOf = (name: string): number => headers.indexOf(name);
  const cell = (row: string[], name: string): string => {
    const index = columnOf(name);
    return index >= 0 ? cleanText(row[index]) : "";
  };

  const questions: ParsedQuestion[] = [];

  // --- Lignes de questions ---------------------------------------------
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const line = starts[i] ?? i + 1;

    // Ligne vide : on l'ignore sans rien dire.
    const isEmpty = row.every((value) => cleanText(value) === "");
    if (isEmpty) continue;

    const rowErrors: string[] = [];
    const prefix = `Ligne ${line} :`;

    const text = cell(row, "question");
    if (text === "") {
      rowErrors.push(`${prefix} la colonne « question » est obligatoire.`);
    } else if (text.length > MAX_QUESTION_CHARS) {
      rowErrors.push(
        `${prefix} la question fait ${text.length} caractères, le maximum est ${MAX_QUESTION_CHARS} (illisible au vidéoprojecteur).`,
      );
    }

    // --- Propositions de reponse ---
    const rawOptions = LETTERS.map((letter) => ({
      letter,
      text: cell(row, `reponse_${letter.toLowerCase()}`),
    }));

    for (const option of rawOptions) {
      if (option.text.length > MAX_OPTION_CHARS) {
        rowErrors.push(
          `${prefix} la réponse ${option.letter} fait ${option.text.length} caractères, le maximum est ${MAX_OPTION_CHARS}.`,
        );
      }
    }

    if (rawOptions[0].text === "") {
      rowErrors.push(`${prefix} la colonne « reponse_A » est obligatoire.`);
    }
    if (rawOptions[1].text === "") {
      rowErrors.push(`${prefix} la colonne « reponse_B » est obligatoire.`);
    }
    // Un trou au milieu casserait l'affichage : C vide mais D remplie.
    if (rawOptions[2].text === "" && rawOptions[3].text !== "") {
      rowErrors.push(
        `${prefix} la réponse C est vide alors que la réponse D est remplie. Remplissez les réponses dans l'ordre A, B, C, D.`,
      );
    }

    const optionsList: QuestionOption[] = rawOptions.filter(
      (option) => option.text !== "",
    );
    const availableLetters = new Set(optionsList.map((option) => option.letter));

    // --- Bonnes reponses ---
    const rawGood = cell(row, "bonnes_reponses");
    let correctLetters: Letter[] = [];
    if (rawGood === "") {
      rowErrors.push(`${prefix} la colonne « bonnes_reponses » est obligatoire.`);
    } else {
      const pieces = rawGood
        .split(/[;,|/]/)
        .map((piece) => piece.trim().toUpperCase())
        .filter((piece) => piece !== "");

      if (pieces.length === 0) {
        rowErrors.push(`${prefix} la colonne « bonnes_reponses » est obligatoire.`);
      }

      const seen = new Set<string>();
      for (const piece of pieces) {
        if (!(LETTERS as readonly string[]).includes(piece)) {
          rowErrors.push(
            `${prefix} la bonne réponse « ${piece} » n'existe pas. Utilisez A, B, C ou D.`,
          );
          continue;
        }
        const letter = piece as Letter;
        if (!availableLetters.has(letter)) {
          rowErrors.push(
            `${prefix} la bonne réponse « ${letter} » renvoie à une proposition vide.`,
          );
          continue;
        }
        if (seen.has(letter)) continue;
        seen.add(letter);
        correctLetters.push(letter);
      }

      if (correctLetters.length === optionsList.length && optionsList.length > 1) {
        rowErrors.push(
          `${prefix} toutes les propositions sont marquées comme bonnes réponses.`,
        );
      }
    }

    // --- Duree du fichier (ignoree sauf si la case est cochee) ---
    const rawDuration = cell(row, "duree_secondes");
    let fileDurationSeconds: number | null = null;
    if (rawDuration !== "") {
      const value = Number(rawDuration.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) {
        if (options.useFileDurations) {
          rowErrors.push(
            `${prefix} la durée « ${rawDuration} » n'est pas un nombre de secondes valide.`,
          );
        }
      } else if (value < 5) {
        if (options.useFileDurations) {
          rowErrors.push(
            `${prefix} la durée de ${value} s est trop courte (minimum 5 secondes).`,
          );
        }
      } else {
        fileDurationSeconds = Math.round(value);
      }
    } else if (options.useFileDurations) {
      rowErrors.push(
        `${prefix} la colonne « duree_secondes » est vide alors que vous avez choisi d'utiliser les durées du fichier.`,
      );
    }

    const explanation = cell(row, "explication");
    if (explanation.length > MAX_EXPLANATION_CHARS) {
      rowErrors.push(
        `${prefix} l'explication fait ${explanation.length} caractères, le maximum est ${MAX_EXPLANATION_CHARS}.`,
      );
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    questions.push({
      line,
      theme: cell(row, "theme").slice(0, MAX_TAG_CHARS) || null,
      domaine: cell(row, "domaine").slice(0, MAX_TAG_CHARS) || null,
      text,
      options: optionsList,
      correctLetters,
      fileDurationSeconds,
      explanation: explanation || null,
    });
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push("Aucune question trouvée dans le fichier.");
  }

  return { questions, errors };
}

// ---------------------------------------------------------------------------
//  Ecriture de CSV (exports et modele)
// ---------------------------------------------------------------------------

/** Met un champ entre guillemets si besoin et double les guillemets internes. */
export function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",;\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Construit un CSV complet, avec BOM pour qu'Excel affiche les accents. */
export function buildCsv(rows: (string | number | null)[][]): string {
  const body = rows.map((row) => row.map(csvField).join(",")).join("\r\n");
  return `﻿${body}\r\n`;
}

/** Le fichier « Télécharger le modèle CSV ». */
export function buildTemplateCsv(): string {
  return buildCsv([
    [...CSV_HEADERS],
    [
      "Culture générale",
      "Géographie",
      "Quelle est la capitale du Cameroun ?",
      "Douala",
      "Yaoundé",
      "Garoua",
      "Bafoussam",
      "B",
      "60",
      "Yaoundé est la capitale politique ; Douala est la capitale économique.",
    ],
    [
      "Culture générale",
      "Informatique",
      "Parmi ces propositions, lesquelles sont des tableurs ? (plusieurs réponses)",
      "Microsoft Excel",
      "Google Sheets",
      "Adobe Photoshop",
      "VLC",
      "A;B",
      "90",
      "Excel et Google Sheets servent à faire des calculs ; les deux autres non.",
    ],
    [
      "Culture générale",
      "Vrai ou faux",
      "Le soleil se lève à l'ouest.",
      "Vrai",
      "Faux",
      "",
      "",
      "B",
      "30",
      "Le soleil se lève à l'est : laissez reponse_C et reponse_D vides pour une question à 2 choix.",
    ],
  ]);
}
