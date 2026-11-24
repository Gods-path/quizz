import { asInt, asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { buildImportPreview, ImportError } from "@/lib/import";
import { NextResponse } from "next/server";

/**
 * Aperçu avant enregistrement : renvoie la liste des questions avec la
 * durée calculée de chacune et le total. Rien n'est écrit en base.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const body = await readJson(request);
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (csv.trim() === "") return fail("Aucun fichier CSV reçu.");
    if (csv.length > 2_000_000) {
      return fail("Le fichier est trop gros (2 Mo maximum).");
    }

    const totalMinutes = asInt(body.totalMinutes);
    if (totalMinutes === null) {
      return fail("Indiquez une durée totale en minutes (par exemple 45).");
    }

    try {
      const preview = buildImportPreview({
        csv,
        totalMinutes,
        useFileDurations: body.useFileDurations === true,
        locked: (body.locked ?? {}) as Record<number, number>,
      });
      return ok({
        titre: asString(body.title, 120),
        ...preview,
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
  });
}
