import { blockIfNotAdmin, guard, ok } from "@/lib/api";
import { endGame } from "@/lib/game-server";

/** « Terminer le quiz » : arrête la partie où qu'elle en soit. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    return ok({ partie: await endGame(id) });
  });
}
