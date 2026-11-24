import { guard, ok } from "@/lib/api";
import { isAdmin } from "@/lib/auth";

/** Permet à la page formateur de savoir si elle doit demander le mot de passe. */
export async function GET() {
  return guard(async () => ok({ connecte: await isAdmin() }));
}
