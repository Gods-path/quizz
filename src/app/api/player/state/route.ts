import { asString, fail, guard, ok, readJson } from "@/lib/api";
import {
  GameError,
  loadGame,
  playersOf,
  questionAt,
  rank,
  remainingMs,
  toSafeQuestion,
  verifyPlayer,
  type AnswerRow,
} from "@/lib/game-server";
import { hasPassed } from "@/lib/scoring";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Tout ce que le téléphone a besoin de savoir, selon le moment du jeu.
 *
 * C'est la seule route qui alimente l'écran de l'apprenant. Elle est
 * appelée à chaque changement signalé par Supabase Realtime, et aussi
 * au chargement de la page (ce qui assure la reconnexion après une
 * coupure de réseau : rien n'est gardé côté téléphone, sauf son jeton).
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson(request);
    const playerId = asString(body.playerId, 40);
    const token = asString(body.token, 80);

    try {
      const player = await verifyPlayer(playerId, token);
      const game = await loadGame(player.game_id);
      const players = await playersOf(game.id);
      const classement = rank(players);
      const moi = classement.find((entry) => entry.id === player.id);

      const base = {
        phase: game.phase,
        code: game.code,
        quizTitre: game.quiz_title,
        modeMoqueur: game.mock_mode,
        nom: player.name,
        score: player.score,
        rang: moi?.rank ?? classement.length,
        joueurs: classement.length,
        questionCount: game.question_count,
        index: game.current_index,
      };

      if (game.phase === "lobby") {
        return ok(base);
      }

      if (game.phase === "finished") {
        const pourcentage =
          game.question_count > 0
            ? Math.round((player.correct_count / game.question_count) * 1000) / 10
            : 0;
        return ok({
          ...base,
          bilan: {
            bonnesReponses: player.correct_count,
            total: game.question_count,
            pourcentage,
            meilleureSerie: player.best_streak,
            reussi: hasPassed(
              player.correct_count,
              game.question_count,
              game.pass_threshold,
            ),
            seuil: game.pass_threshold,
          },
          top5: classement.slice(0, 5),
        });
      }

      const client = supabaseAdmin();
      const { data: answerRow } = await client
        .from("answers")
        .select("*")
        .eq("player_id", player.id)
        .eq("question_index", game.current_index)
        .maybeSingle();
      const answer = answerRow as AnswerRow | null;

      // --- Question en cours : AUCUNE bonne réponse n'est envoyée ---
      if (game.phase === "question") {
        const question = await questionAt(game.quiz_id, game.current_index);
        return ok({
          ...base,
          question: toSafeQuestion(question, game),
          enPause: game.paused_at !== null,
          tempsRestantMs: remainingMs(game),
          aRepondu: answer !== null,
          maSelection: answer?.selected_letters ?? [],
          ontRepondu: game.answered_count,
        });
      }

      // --- Correction : maintenant, on peut tout dire ---
      const question = await questionAt(game.quiz_id, game.current_index);
      const gagne = answer ? answer.points + answer.streak_bonus : 0;

      return ok({
        ...base,
        resultat: {
          aRepondu: answer !== null,
          juste: answer?.is_correct ?? false,
          maSelection: answer?.selected_letters ?? [],
          bonnesReponses: question.correct_letters,
          explication: question.explanation,
          pointsGagnes: gagne,
          bonusSerie: answer?.streak_bonus ?? 0,
          serie: player.streak,
          messageSerie:
            (answer?.streak_bonus ?? 0) > 0 ? `🔥 Série de ${player.streak} !` : null,
        },
        question: {
          index: question.position,
          total: game.question_count,
          text: question.text,
          options: question.options,
        },
        top5: classement.slice(0, 5),
      });
    } catch (error) {
      if (error instanceof GameError) return fail(error.message, error.status);
      throw error;
    }
  });
}
