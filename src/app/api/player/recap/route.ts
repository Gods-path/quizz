import { asString, fail, guard, ok, readJson } from "@/lib/api";
import {
  GameError,
  loadGame,
  verifyPlayer,
  type AnswerRow,
  type QuestionRow,
} from "@/lib/game-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * La correction complète pour l'apprenant, à la fin de la partie :
 * pour chaque question, sa réponse, la bonne réponse et l'explication.
 *
 * Accessible uniquement quand la partie est terminée.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson(request);
    const playerId = asString(body.playerId, 40);
    const token = asString(body.token, 80);

    try {
      const player = await verifyPlayer(playerId, token);
      const game = await loadGame(player.game_id);

      if (game.phase !== "finished") {
        return fail("La correction sera disponible à la fin du quiz.", 409);
      }

      const client = supabaseAdmin();
      const [questionsResult, answersResult] = await Promise.all([
        client
          .from("questions")
          .select("*")
          .eq("quiz_id", game.quiz_id)
          .order("position"),
        client.from("answers").select("*").eq("player_id", player.id),
      ]);

      const questions = (questionsResult.data ?? []) as QuestionRow[];
      const answers = new Map(
        ((answersResult.data ?? []) as AnswerRow[]).map((answer) => [
          answer.question_index,
          answer,
        ]),
      );

      return ok({
        correction: questions.map((question) => {
          const answer = answers.get(question.position);
          return {
            numero: question.position + 1,
            texte: question.text,
            options: question.options,
            maSelection: answer?.selected_letters ?? [],
            bonnesReponses: question.correct_letters,
            juste: answer?.is_correct ?? false,
            aRepondu: answer !== undefined,
            points: answer ? answer.points + answer.streak_bonus : 0,
            explication: question.explanation,
          };
        }),
      });
    } catch (error) {
      if (error instanceof GameError) return fail(error.message, error.status);
      throw error;
    }
  });
}
