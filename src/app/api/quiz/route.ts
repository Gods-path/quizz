import { NextResponse } from "next/server";
import { asInt, asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { buildImportPreview, ImportError } from "@/lib/import";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** La bibliothèque de quiz : titre, nombre de questions, durée totale. */
export async function GET() {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const client = supabaseAdmin();
    const { data: quizzes, error } = await client
      .from("quizzes")
      .select("id, title, total_duration_minutes, created_at")
      .order("created_at", { ascending: false });
    if (error) return fail(error.message, 500);

    // Nombre de questions par quiz, en une seule requête.
    const { data: questions } = await client.from("questions").select("quiz_id");
    const counts = new Map<string, number>();
    for (const row of questions ?? []) {
      const id = (row as { quiz_id: string }).quiz_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return ok({
      quiz: (quizzes ?? []).map((quiz) => ({
        ...quiz,
        question_count: counts.get(quiz.id) ?? 0,
      })),
    });
  });
}

/** Enregistre un nouveau quiz à partir du CSV et des durées de l'aperçu. */
export async function POST(request: Request) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const body = await readJson(request);
    const title = asString(body.title, 120);
    if (title === "") return fail("Donnez un titre au quiz.");

    const csv = typeof body.csv === "string" ? body.csv : "";
    if (csv.trim() === "") return fail("Aucun fichier CSV reçu.");

    const totalMinutes = asInt(body.totalMinutes);
    if (totalMinutes === null) {
      return fail("Indiquez une durée totale en minutes (par exemple 45).");
    }

    let preview;
    try {
      preview = buildImportPreview({
        csv,
        totalMinutes,
        useFileDurations: body.useFileDurations === true,
        locked: (body.locked ?? {}) as Record<number, number>,
      });
    } catch (error) {
      if (error instanceof ImportError) {
        return NextResponse.json(
          { erreur: error.message, details: error.details },
          { status: 400 },
        );
      }
      throw error;
    }

    const client = supabaseAdmin();
    const { data: quiz, error: quizError } = await client
      .from("quizzes")
      .insert({
        title,
        total_duration_minutes: Math.round(preview.totalSeconds / 60),
      })
      .select()
      .single();

    if (quizError) return fail(quizError.message, 500);

    const { error: questionsError } = await client.from("questions").insert(
      preview.questions.map((question) => ({
        quiz_id: quiz.id,
        position: question.position,
        theme: question.theme,
        domaine: question.domaine,
        text: question.text,
        options: question.options,
        correct_letters: question.correctLetters,
        duration_seconds: question.durationSeconds,
        explanation: question.explanation,
      })),
    );

    if (questionsError) {
      // On ne laisse pas un quiz vide derrière nous.
      await client.from("quizzes").delete().eq("id", quiz.id);
      return fail(questionsError.message, 500);
    }

    return ok(
      {
        id: quiz.id,
        titre: quiz.title,
        questions: preview.questions.length,
        dureeTotaleSecondes: preview.totalSeconds,
      },
      201,
    );
  });
}
