import { asInt, asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { generateGameCode } from "@/lib/code";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** L'historique des parties passées. */
export async function GET() {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { data, error } = await supabaseAdmin()
      .from("games")
      .select(
        "id, code, quiz_title, question_count, phase, player_count, pass_threshold, created_at, ended_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return fail(error.message, 500);

    return ok({ parties: data ?? [] });
  });
}

/** Crée une partie et son code à 6 caractères. */
export async function POST(request: Request) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const body = await readJson(request);
    const quizId = asString(body.quizId, 40);
    if (quizId === "") return fail("Choisissez un quiz.");

    const threshold = asInt(body.passThreshold) ?? 72;
    if (threshold < 0 || threshold > 100) {
      return fail("Le seuil de réussite doit être entre 0 et 100 %.");
    }

    const client = supabaseAdmin();

    const { data: quiz } = await client
      .from("quizzes")
      .select("id, title")
      .eq("id", quizId)
      .maybeSingle();
    if (!quiz) return fail("Ce quiz n'existe pas.", 404);

    const { count } = await client
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId);

    if (!count) return fail("Ce quiz n'a aucune question.");

    // Le code doit être unique : on retente si le tirage tombe sur un code pris.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateGameCode();
      const { data, error } = await client
        .from("games")
        .insert({
          code,
          quiz_id: quizId,
          quiz_title: quiz.title,
          question_count: count,
          pass_threshold: threshold,
          mock_mode: body.mockMode !== false,
        })
        .select()
        .maybeSingle();

      if (!error && data) return ok({ partie: data }, 201);
      // 23505 = code déjà utilisé par une partie en cours : on retire.
      if (error && error.code !== "23505") return fail(error.message, 500);
    }

    return fail("Impossible de générer un code de partie. Réessayez.", 500);
  });
}
