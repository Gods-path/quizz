import { cookies } from "next/headers";
import { fail, guard, ok, readJson } from "@/lib/api";
import {
  ADMIN_COOKIE,
  SESSION_COOKIE_OPTIONS,
  checkPassword,
  createSessionValue,
} from "@/lib/auth";

export async function POST(request: Request) {
  return guard(async () => {
    const body = await readJson(request);

    if (!checkPassword(body.password)) {
      return fail("Mot de passe incorrect.", 401);
    }

    const store = await cookies();
    store.set(ADMIN_COOKIE, await createSessionValue(), SESSION_COOKIE_OPTIONS);
    return ok({ connecte: true });
  });
}
