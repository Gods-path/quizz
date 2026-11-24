import { blockIfNotAdmin, fail, guard } from "@/lib/api";
import { buildCsv, CSV_HEADERS } from "@/lib/csv";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Letter, QuestionOption } from "@/lib/types";

/** Réexporte le quiz au même format que celui attendu à l'import. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const client = supabaseAdmin();

    const { data: quiz } = await client
      .from("quizzes")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    if (!quiz) return fail("Ce quiz n'existe pas.", 404);

    const { data: questions, error } = await client
      .from("questions")
      .select("*")
      .eq("quiz_id", id)
      .order("position");
    if (error) return fail(error.message, 500);

    const rows: (string | number | null)[][] = [[...CSV_HEADERS]];
    for (const question of (questions ?? []) as {
      theme: string | null;
      domaine: string | null;
      text: string;
      options: QuestionOption[];
      correct_letters: Letter[];
      duration_seconds: number;
      explanation: string | null;
    }[]) {
      const byLetter = new Map(
        question.options.map((option) => [option.letter, option.text]),
      );
      rows.push([
        question.theme ?? "",
        question.domaine ?? "",
        question.text,
        byLetter.get("A") ?? "",
        byLetter.get("B") ?? "",
        byLetter.get("C") ?? "",
        byLetter.get("D") ?? "",
        question.correct_letters.join(";"),
        question.duration_seconds,
        question.explanation ?? "",
      ]);
    }

    const filename = `${quiz.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "quiz"}.csv`;

    return new Response(buildCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  });
}
