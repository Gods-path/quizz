import { asString, fail, guard, ok, readJson } from "@/lib/api";
import { GameError, loadGame, recordAnswer, verifyPlayer } from "@/lib/game-server";
import { normalizeSelection } from "@/lib/scoring";

/**
 * Le téléphone envoie UNIQUEMENT les lettres choisies.
 *
 * Le serveur calcule le temps écoulé et les points. Et surtout : la
 * réponse de cette route NE DIT PAS si c'était juste. L'apprenant
 * l'apprend à la correction, en même temps que toute la salle.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson(request);
    const playerId = asString(body.playerId, 40);
    const token = asString(body.token, 80);

    try {
      const player = await verifyPlayer(playerId, token);
      const game = await loadGame(player.game_id);
      const letters = normalizeSelection(body.letters);

      const result = await recordAnswer(game, player, letters);
      return ok({ enregistre: result.accepted });
    } catch (error) {
      if (error instanceof GameError) return fail(error.message, error.status);
      throw error;
    }
  });
}
