import { asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Retire un joueur (nom inapproprié, doublon...).
 * On ne le supprime pas : on le marque « retiré », pour que ses réponses
 * restent cohérentes et qu'il ne puisse pas revenir avec le même jeton.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const body = await readJson(request);
    const playerId = asString(body.playerId, 40);
    if (playerId === "") return fail("Quel joueur faut-il retirer ?");

    const { data, error } = await supabaseAdmin()
      .from("players")
      .update({ removed: true })
      .eq("id", playerId)
      .eq("game_id", id)
      .select("id, name")
      .maybeSingle();

    if (error) return fail(error.message, 500);
    if (!data) return fail("Ce joueur n'est pas dans cette partie.", 404);

    return ok({ retire: data.name });
  });
}
