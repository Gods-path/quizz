/**
 * Le cœur du jeu, côté serveur uniquement.
 *
 * C'est ici que se décide tout ce qui compte : l'heure de début d'une
 * question, le temps écoulé, les points, le passage à la question suivante.
 * Le téléphone ne fait que demander et afficher.
 */

import { supabaseAdmin } from "./supabase-admin.ts";
import { scoreAnswer } from "./scoring.ts";
import type { GamePhase, Letter, QuestionOption, SafeQuestion } from "./types.ts";

export interface GameRow {
  id: string;
  code: string;
  quiz_id: string;
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
  created_at: string;
  ended_at: string | null;
}

export interface QuestionRow {
  id: string;
  quiz_id: string;
  position: number;
  theme: string | null;
  domaine: string | null;
  text: string;
  options: QuestionOption[];
  correct_letters: Letter[];
  duration_seconds: number;
  explanation: string | null;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  name: string;
  score: number;
  streak: number;
  best_streak: number;
  correct_count: number;
  answered_count: number;
  removed: boolean;
  joined_at: string;
}

export interface AnswerRow {
  id: string;
  game_id: string;
  player_id: string;
  question_id: string;
  question_index: number;
  selected_letters: Letter[];
  is_correct: boolean;
  points: number;
  streak_bonus: number;
  response_ms: number | null;
  created_at: string;
}

/** Erreur destinée à l'utilisateur : son message est affichable tel quel. */
export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
//  Lecture
// ---------------------------------------------------------------------------

export async function loadGame(id: string): Promise<GameRow> {
  const { data, error } = await supabaseAdmin()
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new GameError(error.message, 500);
  if (!data) throw new GameError("Cette partie n'existe pas.", 404);
  return data as GameRow;
}

export async function loadGameByCode(code: string): Promise<GameRow> {
  const { data, error } = await supabaseAdmin()
    .from("games")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new GameError(error.message, 500);
  if (!data) {
    throw new GameError(
      "Ce code ne correspond à aucune partie. Vérifiez les 6 caractères affichés à l'écran.",
      404,
    );
  }
  return data as GameRow;
}

export async function questionAt(
  quizId: string,
  index: number,
): Promise<QuestionRow> {
  const { data, error } = await supabaseAdmin()
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .eq("position", index)
    .maybeSingle();
  if (error) throw new GameError(error.message, 500);
  if (!data) throw new GameError("Question introuvable.", 404);
  return data as QuestionRow;
}

export async function playersOf(gameId: string): Promise<PlayerRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .order("joined_at", { ascending: true });
  if (error) throw new GameError(error.message, 500);
  return (data ?? []) as PlayerRow[];
}

// ---------------------------------------------------------------------------
//  Le chrono : l'heure du serveur est la seule qui compte
// ---------------------------------------------------------------------------

/** Millisecondes écoulées depuis le début de la question, pauses déduites. */
export function elapsedMs(game: GameRow, now = Date.now()): number {
  if (!game.question_started_at) return 0;
  const started = Date.parse(game.question_started_at);
  const reference = game.paused_at ? Date.parse(game.paused_at) : now;
  return Math.max(0, reference - started - game.pause_total_ms);
}

export function remainingMs(game: GameRow, now = Date.now()): number {
  const duration = (game.question_duration_seconds ?? 0) * 1000;
  return Math.max(0, duration - elapsedMs(game, now));
}

export function isTimeUp(game: GameRow, now = Date.now()): boolean {
  return remainingMs(game, now) <= 0;
}

// ---------------------------------------------------------------------------
//  Ce que le téléphone a le droit de voir
// ---------------------------------------------------------------------------

/**
 * Retire la bonne réponse et l'explication.
 * C'est la seule fonction par laquelle une question part vers un téléphone.
 */
export function toSafeQuestion(
  question: QuestionRow,
  game: GameRow,
): SafeQuestion {
  return {
    index: question.position,
    total: game.question_count,
    theme: question.theme,
    domaine: question.domaine,
    text: question.text,
    options: question.options,
    durationSeconds: question.duration_seconds,
    multiple: question.correct_letters.length > 1,
    startedAt: game.question_started_at,
    serverNow: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
//  Identité du joueur
// ---------------------------------------------------------------------------

/** Vérifie le jeton secret gardé dans le navigateur du joueur. */
export async function verifyPlayer(
  playerId: string,
  token: string,
): Promise<PlayerRow> {
  if (!playerId || !token) {
    throw new GameError("Identifiants de joueur manquants.", 401);
  }
  const client = supabaseAdmin();

  // Les deux lectures partent EN MÊME TEMPS. Enchaînées, elles coûtaient
  // deux allers-retours vers la base ; depuis un téléphone en 3G et avec
  // une base en Europe, chaque aller-retour se paie cher.
  const [secretResultat, playerResultat, expected] = await Promise.all([
    client
      .from("player_secrets")
      .select("token_hash")
      .eq("player_id", playerId)
      .maybeSingle(),
    client.from("players").select("*").eq("id", playerId).maybeSingle(),
    sha256Hex(token),
  ]);

  const secret = secretResultat.data;
  if (!secret || secret.token_hash !== expected) {
    throw new GameError(
      "Session introuvable. Entrez de nouveau votre nom et le code du quiz.",
      401,
    );
  }

  const player = playerResultat.data;
  if (!player) throw new GameError("Joueur introuvable.", 404);
  const row = player as PlayerRow;
  if (row.removed) {
    throw new GameError("Le formateur vous a retiré de cette partie.", 403);
  }
  return row;
}

// ---------------------------------------------------------------------------
//  Transitions : démarrer une question, la clore, passer à la suivante
// ---------------------------------------------------------------------------

/**
 * Passe la partie en « question » sur l'index demandé.
 * La mise à jour est conditionnée à l'état attendu : si deux clics
 * arrivent en même temps, le second ne fait rien.
 */
export async function startQuestion(
  game: GameRow,
  index: number,
  fromPhase: GamePhase,
): Promise<GameRow> {
  const question = await questionAt(game.quiz_id, index);
  const { data, error } = await supabaseAdmin()
    .from("games")
    .update({
      phase: "question",
      current_index: index,
      question_started_at: new Date().toISOString(),
      question_duration_seconds: question.duration_seconds,
      paused_at: null,
      pause_total_ms: 0,
      answered_count: 0,
    })
    .eq("id", game.id)
    .eq("phase", fromPhase)
    .eq("current_index", game.current_index)
    .select()
    .maybeSingle();

  if (error) throw new GameError(error.message, 500);
  if (!data) throw new GameError("La partie a déjà changé d'état.", 409);
  return data as GameRow;
}

/**
 * Clôt la question en cours et applique les points.
 *
 * Les points ne sont ajoutés au score du joueur QU'ICI, et pas au moment
 * où il répond : sinon, en regardant son score bouger, il saurait tout de
 * suite s'il a juste, avant même l'affichage de la correction.
 *
 * C'est aussi ici qu'est calculé le bonus de série, car il dépend de la
 * réponse précédente.
 */
export async function closeQuestion(game: GameRow): Promise<GameRow> {
  const client = supabaseAdmin();
  const index = game.current_index;

  // Verrou : on ne passe en « reveal » qu'une seule fois.
  const { data: locked, error: lockError } = await client
    .from("games")
    .update({ phase: "reveal", paused_at: null })
    .eq("id", game.id)
    .eq("phase", "question")
    .eq("current_index", index)
    .select()
    .maybeSingle();

  if (lockError) throw new GameError(lockError.message, 500);
  if (!locked) throw new GameError("La question est déjà corrigée.", 409);

  const [{ data: answers }, players] = await Promise.all([
    client
      .from("answers")
      .select("*")
      .eq("game_id", game.id)
      .eq("question_index", index),
    playersOf(game.id),
  ]);

  const answerByPlayer = new Map<string, AnswerRow>();
  for (const answer of (answers ?? []) as AnswerRow[]) {
    answerByPlayer.set(answer.player_id, answer);
  }

  const updatedPlayers: PlayerRow[] = [];
  const bonusUpdates: { id: string; streak_bonus: number }[] = [];

  for (const player of players) {
    if (player.removed) continue;
    const answer = answerByPlayer.get(player.id);

    // Personne n'a répondu pour lui : la série tombe, le score ne bouge pas.
    if (!answer) {
      if (player.streak !== 0) updatedPlayers.push({ ...player, streak: 0 });
      continue;
    }

    const newStreak = answer.is_correct ? player.streak + 1 : 0;
    const bonus = answer.is_correct && newStreak >= 3 ? 100 : 0;

    if (bonus !== answer.streak_bonus) {
      bonusUpdates.push({ id: answer.id, streak_bonus: bonus });
    }

    updatedPlayers.push({
      ...player,
      score: player.score + answer.points + bonus,
      streak: newStreak,
      best_streak: Math.max(player.best_streak, newStreak),
      correct_count: player.correct_count + (answer.is_correct ? 1 : 0),
      answered_count: player.answered_count + 1,
    });
  }

  if (updatedPlayers.length > 0) {
    const { error } = await client.from("players").upsert(updatedPlayers);
    if (error) throw new GameError(error.message, 500);
  }
  for (const update of bonusUpdates) {
    await client
      .from("answers")
      .update({ streak_bonus: update.streak_bonus })
      .eq("id", update.id);
  }

  return locked as GameRow;
}

/** Termine la partie. */
export async function endGame(gameId: string): Promise<GameRow> {
  const { data, error } = await supabaseAdmin()
    .from("games")
    .update({
      phase: "finished",
      ended_at: new Date().toISOString(),
      paused_at: null,
    })
    .eq("id", gameId)
    .select()
    .maybeSingle();
  if (error) throw new GameError(error.message, 500);
  if (!data) throw new GameError("Cette partie n'existe pas.", 404);
  return data as GameRow;
}

// ---------------------------------------------------------------------------
//  Enregistrement d'une réponse
// ---------------------------------------------------------------------------

export interface RecordedAnswer {
  /** Volontairement vide de toute information sur la justesse. */
  accepted: true;
  remainingMs: number;
}

export async function recordAnswer(
  game: GameRow,
  player: PlayerRow,
  letters: Letter[],
): Promise<RecordedAnswer> {
  if (game.phase !== "question") {
    throw new GameError("Ce n'est pas le moment de répondre.", 409);
  }
  if (game.paused_at) {
    throw new GameError("Le quiz est en pause, attendez le formateur.", 409);
  }
  if (letters.length === 0) {
    throw new GameError("Choisissez au moins une réponse.", 400);
  }

  const question = await questionAt(game.quiz_id, game.current_index);
  const elapsed = elapsedMs(game);

  const score = scoreAnswer({
    selected: letters,
    correct: question.correct_letters,
    elapsedMs: elapsed,
    durationSeconds: question.duration_seconds,
    previousStreak: player.streak,
  });

  if (score.tooLate) {
    throw new GameError("Trop tard, le temps est écoulé.", 409);
  }

  const { error } = await supabaseAdmin().from("answers").insert({
    game_id: game.id,
    player_id: player.id,
    question_id: question.id,
    question_index: game.current_index,
    selected_letters: letters,
    is_correct: score.isCorrect,
    points: score.points,
    streak_bonus: 0, // calculé à la correction, voir closeQuestion
    response_ms: elapsed,
  });

  if (error) {
    // 23505 = violation d'unicité : le joueur avait déjà répondu.
    if (error.code === "23505") {
      throw new GameError("Vous avez déjà répondu à cette question.", 409);
    }
    throw new GameError(error.message, 500);
  }

  return { accepted: true, remainingMs: remainingMs(game) };
}

// ---------------------------------------------------------------------------
//  Classement
// ---------------------------------------------------------------------------

export interface Ranked {
  rank: number;
  id: string;
  name: string;
  score: number;
  correct_count: number;
  answered_count: number;
  streak: number;
}

export function rank(players: PlayerRow[]): Ranked[] {
  return players
    .filter((player) => !player.removed)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correct_count - a.correct_count ||
        Date.parse(a.joined_at) - Date.parse(b.joined_at),
    )
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      score: player.score,
      correct_count: player.correct_count,
      answered_count: player.answered_count,
      streak: player.streak,
    }));
}
