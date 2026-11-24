import { cookies } from "next/headers";
import { guard, ok } from "@/lib/api";
import { ADMIN_COOKIE } from "@/lib/auth";

export async function POST() {
  return guard(async () => {
    const store = await cookies();
    store.delete(ADMIN_COOKIE);
    return ok({ connecte: false });
  });
}
