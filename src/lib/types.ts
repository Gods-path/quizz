/**
 * Les types partages entre le serveur et le navigateur.
 */

export const LETTERS = ["A", "B", "C", "D"] as const;
export type Letter = (typeof LETTERS)[number];

export function isLetter(value: string): value is Letter {
  return (LETTERS as readonly string[]).includes(value);
}

/** Une proposition de reponse affichee a l'ecran. */
export interface QuestionOption {
  letter: Letter;
  text: string;
}

/** Une question telle qu'elle sort du fichier CSV, avant enregistrement. */
export interface ParsedQuestion {
  /** Numero de ligne dans le fichier (l'en-tete est la ligne 1). */
  line: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  correctLetters: Letter[];
  /** Valeur de la colonne duree_secondes, si elle est utilisable. */
  fileDurationSeconds: number | null;
  explanation: string | null;
}

/** Une question prete a etre enregistree : sa duree est decidee. */
export interface PreparedQuestion extends ParsedQuestion {
  durationSeconds: number;
}

export type GamePhase = "lobby" | "question" | "reveal" | "finished";

/** L'etat public d'une partie : ce que le navigateur recoit en direct. */
export interface PublicGame {
  id: string;
  code: string;
  quiz_title: string;
  question_count: number;
  phase: GamePhase;
  current_index: number;
  question_started_at: string | null;
  question_duration_seconds: number | null;
  paused_at: string | null;
  pause_total_ms: number;
  answered_count: number;
  player_count: number;
  pass_threshold: number;
  mock_mode: boolean;
  ended_at: string | null;
}

/** Un joueur tel que les deux ecrans le voient. */
export interface PublicPlayer {
  id: string;
  game_id: string;
  name: string;
  score: number;
  streak: number;
  correct_count: number;
  answered_count: number;
  removed: boolean;
  joined_at: string;
}

/**
 * Une question envoyee au telephone : elle ne contient NI les bonnes
 * reponses NI l'explication. C'est volontaire et c'est verifie par les tests.
 */
export interface SafeQuestion {
  index: number;
  total: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  durationSeconds: number;
  multiple: boolean;
  startedAt: string | null;
  serverNow: string;
}
