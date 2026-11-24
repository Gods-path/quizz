import { blockIfNotAdmin, fail, guard, ok } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Supprime une partie de l'historique, avec ses joueurs et leurs réponses
 * (la base s'en charge en cascade). Sert à nettoyer les parties d'essai.
 * Le quiz lui-même n'est pas touché.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const { data, error } = await supabaseAdmin()
      .from("games")
      .delete()
      .eq("id", id)
      .select("code")
      .maybeSingle();

    if (error) return fail(error.message, 500);
    if (!data) return fail("Cette partie n'existe pas.", 404);

    return ok({ supprime: data.code });
  });
}
