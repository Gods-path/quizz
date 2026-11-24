import { blockIfNotAdmin, fail, guard } from "@/lib/api";
import { buildCsv } from "@/lib/csv";
import {
  loadGame,
  playersOf,
  rank,
  type AnswerRow,
  type QuestionRow,
} from "@/lib/game-server";
import { hasPassed } from "@/lib/scoring";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Export des résultats : une ligne par apprenant, avec sa réponse à
 * chaque question. Ouvrable directement dans Excel (BOM + accents).
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
    const client = supabaseAdmin();

    const [players, questionsResult, answersResult] = await Promise.all([
      playersOf(id),
      client.from("questions").select("*").eq("quiz_id", game.quiz_id).order("position"),
      client.from("answers").select("*").eq("game_id", id),
    ]);

    if (questionsResult.error) return fail(questionsResult.error.message, 500);

    const questions = (questionsResult.data ?? []) as QuestionRow[];
    const answers = (answersResult.data ?? []) as AnswerRow[];

    const byPlayer = new Map<string, Map<number, AnswerRow>>();
    for (const answer of answers) {
      if (!byPlayer.has(answer.player_id)) byPlayer.set(answer.player_id, new Map());
      byPlayer.get(answer.player_id)!.set(answer.question_index, answer);
    }

    const header = [
      "rang",
      "nom",
      "points",
      "bonnes_reponses",
      "total_questions",
      "pourcentage",
      "resultat",
      "meilleure_serie",
    ];
    for (const question of questions) {
      const numero = question.position + 1;
      header.push(
        `Q${numero}_reponse`,
        `Q${numero}_attendu`,
        `Q${numero}_juste`,
        `Q${numero}_points`,
        `Q${numero}_temps_s`,
      );
    }

    const rows: (string | number | null)[][] = [header];

    for (const entry of rank(players)) {
      const player = players.find((candidate) => candidate.id === entry.id)!;
      const percentage =
        questions.length > 0
          ? Math.round((player.correct_count / questions.length) * 1000) / 10
          : 0;

      const row: (string | number | null)[] = [
        entry.rank,
        player.name,
        player.score,
        player.correct_count,
        questions.length,
        `${percentage.toString().replace(".", ",")} %`,
        hasPassed(player.correct_count, questions.length, game.pass_threshold)
          ? "Réussi"
          : "À retravailler",
        player.best_streak,
      ];

      for (const question of questions) {
        const answer = byPlayer.get(player.id)?.get(question.position);
        row.push(
          answer ? answer.selected_letters.join(";") : "(pas de réponse)",
          question.correct_letters.join(";"),
          answer ? (answer.is_correct ? "oui" : "non") : "non",
          answer ? answer.points + answer.streak_bonus : 0,
          answer?.response_ms != null
            ? (Math.round(answer.response_ms / 100) / 10)
                .toString()
                .replace(".", ",")
            : "",
        );
      }

      rows.push(row);
    }

    const date = new Date(game.created_at).toISOString().slice(0, 10);
    const safeTitle =
      game.quiz_title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "quiz";
    const filename = `resultats-${safeTitle}-${date}-${game.code}.csv`;

    return new Response(buildCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  });
}
