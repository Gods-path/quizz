import { blockIfNotAdmin, guard, ok } from "@/lib/api";
import {
  loadGame,
  playersOf,
  questionAt,
  rank,
  remainingMs,
  type AnswerRow,
} from "@/lib/game-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LETTERS } from "@/lib/types";

/**
 * Tout ce dont l'écran projeté a besoin.
 *
 * La bonne réponse n'est incluse QU'À PARTIR de la phase de correction,
 * même sur cet écran : rien n'oblige à l'avoir en mémoire avant.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const game = await loadGame(id);
    const players = await playersOf(id);
    const classement = rank(players);

    const reponse: Record<string, unknown> = {
      partie: game,
      joueurs: players
        .filter((player) => !player.removed)
        .map((player) => ({
          id: player.id,
          name: player.name,
          score: player.score,
          joined_at: player.joined_at,
        })),
      classement,
      tempsRestantMs: game.phase === "question" ? remainingMs(game) : 0,
    };

    if (game.phase === "lobby" || game.phase === "finished") {
      return ok(reponse);
    }

    const question = await questionAt(game.quiz_id, game.current_index);
    const corrige = game.phase === "reveal";

    reponse.question = {
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
      // seulement à la correction
      correctLetters: corrige ? question.correct_letters : undefined,
      explanation: corrige ? question.explanation : undefined,
    };

    if (corrige) {
      const { data } = await supabaseAdmin()
        .from("answers")
        .select("*")
        .eq("game_id", id)
        .eq("question_index", game.current_index);

      const answers = (data ?? []) as AnswerRow[];
      const repartition = LETTERS.filter((letter) =>
        question.options.some((option) => option.letter === letter),
      ).map((letter) => ({
        letter,
        count: answers.filter((answer) => answer.selected_letters.includes(letter))
          .length,
      }));

      reponse.repartition = repartition;
      reponse.bonnesReponsesCount = answers.filter((a) => a.is_correct).length;
      reponse.sansReponse = Math.max(
        0,
        classement.length - new Set(answers.map((a) => a.player_id)).size,
      );
    }

    return ok(reponse);
  });
}
