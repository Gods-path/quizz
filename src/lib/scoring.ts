/**
 * Calcul des points. TOUT se passe sur le serveur : le telephone n'envoie
 * que les lettres choisies, jamais un temps ni un score.
 *
 * Regles :
 *   - faux ou pas de reponse : 0 point, la serie repart de zero ;
 *   - juste : de 500 a 1000 points selon la rapidite ;
 *   - bonus de serie : +100 des la 3e bonne reponse consecutive.
 */

import type { Letter } from "./types.ts";

export const MAX_POINTS = 1000;
export const MIN_CORRECT_POINTS = 500;
export const STREAK_BONUS = 100;
export const STREAK_THRESHOLD = 3;

/** Marge de tolerance reseau : une reponse partie a temps mais arrivee
 *  juste apres le chrono reste acceptee. */
export const LATE_TOLERANCE_MS = 1000;

/** Juste seulement si l'ensemble choisi est exactement l'ensemble attendu. */
export function isAnswerCorrect(
  selected: readonly string[],
  correct: readonly string[],
): boolean {
  const chosen = new Set(selected.map((l) => l.toUpperCase()));
  const expected = new Set(correct.map((l) => l.toUpperCase()));
  if (chosen.size === 0 || chosen.size !== expected.size) return false;
  for (const letter of expected) {
    if (!chosen.has(letter)) return false;
  }
  return true;
}

/** 1000 points instantanement, 500 points au bout du temps imparti. */
export function computePoints(
  elapsedMs: number,
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) return MAX_POINTS;
  const ratio = Math.min(Math.max(elapsedMs / (durationSeconds * 1000), 0), 1);
  const points = MAX_POINTS - (MAX_POINTS - MIN_CORRECT_POINTS) * ratio;
  return Math.round(points);
}

export interface ScoreInput {
  selected: readonly string[];
  correct: readonly string[];
  elapsedMs: number;
  durationSeconds: number;
  previousStreak: number;
  /** true quand le joueur n'a pas repondu du tout avant la fin du temps. */
  timedOut?: boolean;
}

export interface ScoreResult {
  isCorrect: boolean;
  /** Points de rapidite, hors bonus. */
  points: number;
  streakBonus: number;
  /** Points + bonus : ce qui est ajoute au score du joueur. */
  total: number;
  newStreak: number;
  /** « 🔥 Serie de 3 ! » ou null. */
  streakMessage: string | null;
  tooLate: boolean;
}

export function scoreAnswer(input: ScoreInput): ScoreResult {
  const limitMs = input.durationSeconds * 1000 + LATE_TOLERANCE_MS;
  const tooLate = input.timedOut === true || input.elapsedMs > limitMs;

  const isCorrect = !tooLate && isAnswerCorrect(input.selected, input.correct);

  if (!isCorrect) {
    return {
      isCorrect: false,
      points: 0,
      streakBonus: 0,
      total: 0,
      newStreak: 0,
      streakMessage: null,
      tooLate,
    };
  }

  const points = computePoints(input.elapsedMs, input.durationSeconds);
  const newStreak = Math.max(0, input.previousStreak) + 1;
  const streakBonus = newStreak >= STREAK_THRESHOLD ? STREAK_BONUS : 0;

  return {
    isCorrect: true,
    points,
    streakBonus,
    total: points + streakBonus,
    newStreak,
    streakMessage: streakBonus > 0 ? `🔥 Série de ${newStreak} !` : null,
    tooLate: false,
  };
}

/** Les lettres recues du telephone, nettoyees. */
export function normalizeSelection(value: unknown): Letter[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Letter[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const letter = item.trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(letter)) continue;
    if (seen.has(letter)) continue;
    seen.add(letter);
    out.push(letter as Letter);
  }
  return out;
}

/** « Reussi » ou « A retravailler », selon le seuil de la partie. */
export function hasPassed(
  correctCount: number,
  questionCount: number,
  threshold: number,
): boolean {
  if (questionCount <= 0) return false;
  return (correctCount / questionCount) * 100 >= threshold;
}
