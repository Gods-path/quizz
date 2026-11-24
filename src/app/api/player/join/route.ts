import { asString, cleanPlayerName, fail, guard, ok, readJson } from "@/lib/api";
import { isValidGameCode, normalizeGameCode } from "@/lib/code";
import { loadGameByCode, sha256Hex } from "@/lib/game-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Un apprenant entre son nom et le code affiché au vidéoprojecteur.
 *
 * On lui rend un identifiant et un jeton secret, que son téléphone garde.
 * Le jeton n'est stocké en base que haché, dans une table que le
 * navigateur n'a pas le droit de lire.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson(request);

    const code = normalizeGameCode(asString(body.code, 20));
    if (!isValidGameCode(code)) {
      return fail("Le code doit faire 6 caractères, comme affiché à l'écran.");
    }

    const name = cleanPlayerName(body.name);
    if (name === "") return fail("Entrez votre nom ou votre prénom.");
    if (name.length < 2) return fail("Votre nom est trop court.");

    const game = await loadGameByCode(code);

    if (game.phase === "finished") {
      return fail("Cette partie est terminée.", 409);
    }
    if (game.phase !== "lobby") {
      return fail(
        "Le quiz a déjà commencé. Demandez au formateur de créer une nouvelle partie.",
        409,
      );
    }

    const client = supabaseAdmin();
    const token = crypto.randomUUID();

    const { data: player, error } = await client
      .from("players")
      .insert({ game_id: game.id, name })
      .select()
      .maybeSingle();

    if (error) {
      // 23505 = l'index unique (partie, nom en minuscules) a parlé.
      if (error.code === "23505") {
        return fail(
          `Le nom « ${name} » est déjà pris dans cette partie. Ajoutez par exemple une initiale.`,
          409,
        );
      }
      return fail(error.message, 500);
    }
    if (!player) return fail("Impossible de vous inscrire. Réessayez.", 500);

    const { error: secretError } = await client.from("player_secrets").insert({
      player_id: player.id,
      token_hash: await sha256Hex(token),
    });

    if (secretError) {
      await client.from("players").delete().eq("id", player.id);
      return fail(secretError.message, 500);
    }

    return ok(
      {
        playerId: player.id,
        token,
        gameId: game.id,
        code: game.code,
        nom: player.name,
        quizTitre: game.quiz_title,
        modeMoqueur: game.mock_mode,
      },
      201,
    );
  });
}
