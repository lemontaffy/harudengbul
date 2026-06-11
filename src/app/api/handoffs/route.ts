import { getCurrentUser } from "@/lib/currentUser";
import * as handoffsRepo from "@/db/repo/handoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await handoffsRepo.listPending(user.id);
  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      suggestedText: r.suggestedText,
      personaName: r.personaName,
    })),
  });
}
