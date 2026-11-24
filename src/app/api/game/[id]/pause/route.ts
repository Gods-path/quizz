import { blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import { loadGame } from "@/lib/game-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Pause et reprise. Le temps passé en pause est accumulé dans
 * pause_total_ms et retiré du chrono : personne ne perd de points
 * parce que le formateur a répondu à une question de la salle.
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
    const game = await loadGame(id);

    if (game.phase !== "question") {
      return fail("On ne peut mettre en pause que pendant une question.", 409);
    }

    const wantPause = body.pause !== false;
    const client = supabaseAdmin();

    if (wantPause) {
      if (game.paused_at) return ok({ partie: game });
      const { data, error } = await client
        .from("games")
        .update({ paused_at: new Date().toISOString() })
        .eq("id", id)
        .is("paused_at", null)
        .select()
        .maybeSingle();
      if (error) return fail(error.message, 500);
      return ok({ partie: data ?? game });
    }

    if (!game.paused_at) return ok({ partie: game });

    const pausedFor = Date.now() - Date.parse(game.paused_at);
    const { data, error } = await client
      .from("games")
      .update({
        paused_at: null,
        pause_total_ms: game.pause_total_ms + Math.max(0, pausedFor),
      })
      .eq("id", id)
      .not("paused_at", "is", null)
      .select()
      .maybeSingle();
    if (error) return fail(error.message, 500);
    return ok({ partie: data ?? game });
  });
}
