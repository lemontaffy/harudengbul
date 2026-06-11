import { getCurrentUser } from "@/lib/currentUser";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/google";
import * as googleRepo from "@/db/repo/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const account = await googleRepo.getByUser(user.id);
  if (account) {
    await revokeToken(decryptSecret(account.refreshToken)); // best-effort
    await googleRepo.disconnect(user.id);
  }
  return Response.json({ ok: true });
}
