import { asInt, asString, blockIfNotAdmin, fail, guard, ok, readJson } from "@/lib/api";
import {
  closeQuestion,
  endGame,
  GameError,
  isTimeUp,
  loadGame,
  startQuestion,
} from "@/lib/game-server";

/**
 * Vercel coupe une fonction au bout de 10 secondes par défaut. La clôture
 * d'une question écrit le score de toute la classe : avec une grande classe
 * et une base de données située en Europe, 10 secondes peuvent ne pas
 * suffire, et la partie resterait bloquée. On se laisse de la marge.
 */
export const maxDuration = 30;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Fait avancer la partie. C'est l'écran formateur qui appelle cette route.
 *
 * Le navigateur dit TOUJOURS d'où il croit partir (`fromPhase` et
 * `fromIndex`). Si cela ne correspond plus à la base, le serveur refuse :
 * c'est ce qui garantit qu'aucune question n'est sautée ni rejouée, même
 * en cas de double-clic, de reprise d'onglet ou de requête réseau rejouée.
 */
export async function POST(request: Request, { params }: Params) {
  return guard(async () => {
    const blocked = await blockIfNotAdmin();
    if (blocked) return blocked;

    const { id } = await params;
    const body = await readJson(request);
    const fromPhase = asString(body.fromPhase, 20);
    const fromIndex = asInt(body.fromIndex);

    if (fromIndex === null || fromPhase === "") {
      return fail("Requête incomplète : état de départ manquant.");
    }

    const game = await loadGame(id);

    if (game.phase !== fromPhase || game.current_index !== fromIndex) {
      // Pas une erreur : l'écran était juste en retard. On lui rend l'état réel.
      return ok(
        {
          ignore: true,
          raison: "La partie avait déjà avancé.",
          partie: game,
        },
        409,
      );
    }

    try {
      // Salle d'attente -> première question
      if (game.phase === "lobby") {
        if (game.player_count < 1) {
          return fail("Attendez qu'au moins un apprenant ait rejoint la partie.");
        }
        const updated = await startQuestion(game, 0, "lobby");
        return ok({ partie: updated });
      }

      // Question en cours -> correction
      if (game.phase === "question") {
        const everybodyAnswered =
          game.player_count > 0 && game.answered_count >= game.player_count;
        const force = body.force === true;

        if (!force && !everybodyAnswered && !isTimeUp(game)) {
          return fail("Le temps n'est pas encore écoulé.", 409);
        }
        const updated = await closeQuestion(game);
        return ok({ partie: updated });
      }

      // Correction affichée -> question suivante, ou fin de partie
      if (game.phase === "reveal") {
        const next = game.current_index + 1;
        if (next >= game.question_count) {
          return ok({ partie: await endGame(game.id) });
        }
        const updated = await startQuestion(game, next, "reveal");
        return ok({ partie: updated });
      }

      return fail("La partie est terminée.", 409);
    } catch (error) {
      if (error instanceof GameError) {
        return ok(
          { ignore: true, raison: error.message, partie: await loadGame(id) },
          error.status,
        );
      }
      throw error;
    }
  });
}
