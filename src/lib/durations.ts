/**
 * Calcul de la duree de chaque question a partir de la duree totale du quiz.
 *
 * Regles :
 *   - une question "lourde" compte double : plus de 120 caracteres
 *     (question + propositions) OU plusieurs bonnes reponses ;
 *   - le temps est reparti proportionnellement a ce poids ;
 *   - chaque duree est un multiple de 5 secondes, avec un minimum de 15 s ;
 *   - LE TOTAL TOMBE EXACTEMENT sur la duree demandee. Les secondes qui
 *     restent apres arrondi sont distribuees une par une aux questions les
 *     plus desavantagees par l'arrondi (methode du plus fort reste), ce qui
 *     evite une derniere question anormalement longue.
 */

import type { ParsedQuestion } from "./types.ts";

export const STEP_SECONDS = 5;
export const MIN_QUESTION_SECONDS = 15;
export const LONG_QUESTION_CHARS = 120;

const MIN_UNITS = MIN_QUESTION_SECONDS / STEP_SECONDS;

/** Erreur de calcul portant un message deja redige en francais. */
export class DurationError extends Error {}

/** Longueur consideree : le texte de la question plus celui des propositions. */
export function questionLength(question: {
  text: string;
  options: { text: string }[];
}): number {
  return (
    question.text.length +
    question.options.reduce((sum, option) => sum + option.text.length, 0)
  );
}

export function isLongQuestion(question: {
  text: string;
  options: { text: string }[];
}): boolean {
  return questionLength(question) > LONG_QUESTION_CHARS;
}

/** 2 pour une question lourde, 1 sinon. */
export function questionWeight(question: {
  text: string;
  options: { text: string }[];
  correctLetters: readonly unknown[];
}): 1 | 2 {
  const multiple = question.correctLetters.length > 1;
  return multiple || isLongQuestion(question) ? 2 : 1;
}

export function weightsOf(questions: ParsedQuestion[]): (1 | 2)[] {
  return questions.map(questionWeight);
}

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return Number.isInteger(minutes)
    ? `${minutes} minute${minutes > 1 ? "s" : ""}`
    : `${Math.ceil(minutes)} minutes`;
}

/**
 * Repartit `totalSeconds` entre des questions ponderees.
 *
 * @param weights  le poids de chaque question (1 ou 2)
 * @param totalSeconds  la duree totale visee, en secondes
 * @param locked  les durees fixees a la main : { indexDeLaQuestion: secondes }.
 *                Ces questions ne bougent pas, les autres se reajustent.
 * @returns  un tableau de durees en secondes dont la somme vaut exactement
 *           `totalSeconds`
 */
export function allocateDurations(
  weights: number[],
  totalSeconds: number,
  locked: Record<number, number> = {},
): number[] {
  const count = weights.length;
  if (count === 0) {
    throw new DurationError("Aucune question : impossible de répartir le temps.");
  }
  if (!Number.isInteger(totalSeconds) || totalSeconds <= 0) {
    throw new DurationError("La durée totale doit être un nombre de minutes valide.");
  }
  if (totalSeconds % STEP_SECONDS !== 0) {
    throw new DurationError(
      `La durée totale doit être un multiple de ${STEP_SECONDS} secondes.`,
    );
  }

  // Verification des durees fixees a la main.
  let lockedSeconds = 0;
  const lockedIndexes = new Set<number>();
  for (const [key, value] of Object.entries(locked)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (!Number.isInteger(value) || value % STEP_SECONDS !== 0) {
      throw new DurationError(
        `Question ${index + 1} : la durée doit être un multiple de ${STEP_SECONDS} secondes.`,
      );
    }
    if (value < MIN_QUESTION_SECONDS) {
      throw new DurationError(
        `Question ${index + 1} : la durée ne peut pas descendre sous ${MIN_QUESTION_SECONDS} secondes.`,
      );
    }
    lockedIndexes.add(index);
    lockedSeconds += value;
  }

  const freeIndexes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (!lockedIndexes.has(i)) freeIndexes.push(i);
  }

  const result = new Array<number>(count).fill(0);
  for (const index of lockedIndexes) result[index] = locked[index];

  // Tout est fixe a la main : le total doit deja tomber juste.
  if (freeIndexes.length === 0) {
    if (lockedSeconds !== totalSeconds) {
      throw new DurationError(
        `Les durées fixées à la main font ${lockedSeconds} s au lieu de ${totalSeconds} s.`,
      );
    }
    return result;
  }

  const remaining = totalSeconds - lockedSeconds;
  const minimumNeeded = freeIndexes.length * MIN_QUESTION_SECONDS;
  if (remaining < minimumNeeded) {
    const need = lockedSeconds + minimumNeeded;
    throw new DurationError(
      `Durée trop courte : il faut au moins ${formatMinutes(need)} pour ` +
        `${count} question${count > 1 ? "s" : ""} ` +
        `(minimum ${MIN_QUESTION_SECONDS} s par question).`,
    );
  }

  // On travaille en "unites" de 5 secondes : le total tombe donc toujours juste.
  const totalUnits = remaining / STEP_SECONDS;
  const freeWeights = freeIndexes.map((i) => Math.max(weights[i] ?? 1, 0.0001));
  const weightSum = freeWeights.reduce((a, b) => a + b, 0);

  // Chacun part du minimum, puis on repartit ce qui reste au prorata du poids.
  let distributable = totalUnits - freeIndexes.length * MIN_UNITS;
  const shares = freeWeights.map((weight) => (distributable * weight) / weightSum);
  const base = shares.map((share) => Math.floor(share));
  const given = base.reduce((a, b) => a + b, 0);
  let leftover = distributable - given;

  // Methode du plus fort reste : les unites restantes vont aux questions
  // dont l'arrondi a ete le plus defavorable.
  const order = shares
    .map((share, position) => ({ position, rest: share - Math.floor(share) }))
    .sort((a, b) => b.rest - a.rest || a.position - b.position);

  for (let k = 0; k < order.length && leftover > 0; k += 1) {
    base[order[k].position] += 1;
    leftover -= 1;
  }

  freeIndexes.forEach((questionIndex, position) => {
    result[questionIndex] = (MIN_UNITS + base[position]) * STEP_SECONDS;
  });

  return result;
}

/**
 * Calcule les durees d'un quiz entier.
 * Si `useFileDurations` est vrai, les durees du fichier sont conservees
 * telles quelles (arrondies au multiple de 5 s, minimum 15 s).
 */
export function computeQuizDurations(
  questions: ParsedQuestion[],
  totalMinutes: number,
  options: { useFileDurations?: boolean; locked?: Record<number, number> } = {},
): number[] {
  if (options.useFileDurations) {
    return questions.map((question) => {
      const raw = question.fileDurationSeconds ?? 60;
      return Math.max(
        MIN_QUESTION_SECONDS,
        Math.round(raw / STEP_SECONDS) * STEP_SECONDS,
      );
    });
  }
  return allocateDurations(
    weightsOf(questions),
    Math.round(totalMinutes * 60),
    options.locked ?? {},
  );
}

/** Snap une saisie manuelle sur un multiple de 5 s, minimum 15 s. */
export function snapDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_QUESTION_SECONDS;
  return Math.max(
    MIN_QUESTION_SECONDS,
    Math.round(seconds / STEP_SECONDS) * STEP_SECONDS,
  );
}
