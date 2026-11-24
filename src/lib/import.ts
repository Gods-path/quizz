/**
 * Prépare un quiz à partir d'un fichier CSV : lecture, validation, puis
 * calcul de la durée de chaque question. Utilisé par l'aperçu ET par
 * l'enregistrement, afin que l'aperçu montre exactement ce qui sera gardé.
 */

import { parseQuizCsv } from "./csv.ts";
import { computeQuizDurations, DurationError, snapDuration } from "./durations.ts";
import type { Letter, QuestionOption } from "./types.ts";

export interface PreviewQuestion {
  /** Ligne d'origine dans le fichier, utile pour les messages d'erreur. */
  line: number;
  position: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  correctLetters: Letter[];
  explanation: string | null;
  durationSeconds: number;
  /** Vrai si la question compte double (longue ou à plusieurs réponses). */
  heavy: boolean;
  /** Vrai si la durée a été fixée à la main par le formateur. */
  locked: boolean;
}

export interface ImportPreview {
  questions: PreviewQuestion[];
  totalSeconds: number;
  totalMinutes: number;
  /** Nombre de questions comptées double. */
  heavyCount: number;
}

export interface ImportOptions {
  csv: string;
  totalMinutes: number;
  useFileDurations?: boolean;
  /** { indexDeLaQuestion: secondes } fixées à la main. */
  locked?: Record<number, number>;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

export function buildImportPreview(options: ImportOptions): ImportPreview {
  const totalMinutes = options.totalMinutes;
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    throw new ImportError("Indiquez une durée totale en minutes (par exemple 45).");
  }
  if (totalMinutes > 600) {
    throw new ImportError("La durée totale ne peut pas dépasser 600 minutes.");
  }

  const { questions, errors } = parseQuizCsv(options.csv, {
    useFileDurations: options.useFileDurations,
  });

  if (errors.length > 0) {
    throw new ImportError(
      `Le fichier contient ${errors.length} problème${errors.length > 1 ? "s" : ""} à corriger :`,
      errors,
    );
  }

  // On ne garde que les durées manuelles qui désignent une question réelle.
  const locked: Record<number, number> = {};
  for (const [key, value] of Object.entries(options.locked ?? {})) {
    const index = Number(key);
    const seconds = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) continue;
    if (!Number.isFinite(seconds)) continue;
    locked[index] = snapDuration(seconds);
  }

  let durations: number[];
  try {
    durations = computeQuizDurations(questions, totalMinutes, {
      useFileDurations: options.useFileDurations,
      locked,
    });
  } catch (error) {
    if (error instanceof DurationError) throw new ImportError(error.message);
    throw error;
  }

  const prepared: PreviewQuestion[] = questions.map((question, index) => {
    const textLength =
      question.text.length +
      question.options.reduce((sum, option) => sum + option.text.length, 0);
    return {
      line: question.line,
      position: index,
      theme: question.theme,
      domaine: question.domaine,
      text: question.text,
      options: question.options,
      correctLetters: question.correctLetters,
      explanation: question.explanation,
      durationSeconds: durations[index],
      heavy: question.correctLetters.length > 1 || textLength > 120,
      locked: index in locked,
    };
  });

  const totalSeconds = durations.reduce((a, b) => a + b, 0);

  return {
    questions: prepared,
    totalSeconds,
    totalMinutes: totalSeconds / 60,
    heavyCount: prepared.filter((question) => question.heavy).length,
  };
}
