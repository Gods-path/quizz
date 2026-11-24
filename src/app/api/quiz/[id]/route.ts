import { asInt, asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { allocateDurations, DurationError, weightsOf } from "@/lib/durations";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Letter, QuestionOption } from "@/lib/types";

interface Params {
  params: Promise<{ id: string }>;
}

/** Les questions d'un quiz (vue formateur : avec les bonnes réponses). */
export async function GET(_request: Request, { params }: Params) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const client = supabaseAdmin();

    const { data: quiz } = await client
      .from("quizzes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!quiz) return fail("Ce quiz n'existe pas.", 404);

    const { data: questions, error } = await client
      .from("questions")
      .select("*")
      .eq("quiz_id", id)
      .order("position");
    if (error) return fail(error.message, 500);

    return ok({ quiz, questions: questions ?? [] });
  });
}

/** Renommer le quiz et/ou changer sa durée totale (durées recalculées). */
export async function PATCH(request: Request, { params }: Params) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const body = await readJson(request);
    const client = supabaseAdmin();

    const { data: quiz } = await client
      .from("quizzes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!quiz) return fail("Ce quiz n'existe pas.", 404);

    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = asString(body.title, 120);
      if (title === "") return fail("Le titre ne peut pas être vide.");
      update.title = title;
    }

    if (body.totalMinutes !== undefined) {
      const totalMinutes = asInt(body.totalMinutes);
      if (totalMinutes === null || totalMinutes <= 0) {
        return fail("Indiquez une durée totale en minutes (par exemple 45).");
      }
      if (totalMinutes > 600) {
        return fail("La durée totale ne peut pas dépasser 600 minutes.");
      }

      const { data: questions } = await client
        .from("questions")
        .select("id, position, text, options, correct_letters")
        .eq("quiz_id", id)
        .order("position");

      const rows = (questions ?? []) as {
        id: string;
        position: number;
        text: string;
        options: QuestionOption[];
        correct_letters: Letter[];
      }[];

      if (rows.length === 0) return fail("Ce quiz n'a aucune question.");

      let durations: number[];
      try {
        durations = allocateDurations(
          weightsOf(
            rows.map((row) => ({
              line: 0,
              theme: null,
              domaine: null,
              text: row.text,
              options: row.options,
              correctLetters: row.correct_letters,
              fileDurationSeconds: null,
              explanation: null,
            })),
          ),
          totalMinutes * 60,
        );
      } catch (error) {
        if (error instanceof DurationError) return fail(error.message);
        throw error;
      }

      for (const [index, row] of rows.entries()) {
        const { error } = await client
          .from("questions")
          .update({ duration_seconds: durations[index] })
          .eq("id", row.id);
        if (error) return fail(error.message, 500);
      }

      update.total_duration_minutes = totalMinutes;
    }

    if (Object.keys(update).length === 0) {
      return fail("Rien à modifier.");
    }

    const { data, error } = await client
      .from("quizzes")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error.message, 500);

    return ok({ quiz: data });
  });
}

/** Supprime le quiz, ses questions et les parties qui l'utilisaient. */
export async function DELETE(_request: Request, { params }: Params) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const { error } = await supabaseAdmin().from("quizzes").delete().eq("id", id);
    if (error) return fail(error.message, 500);
    return ok({ supprime: true });
  });
}
