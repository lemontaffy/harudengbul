import { getCurrentUser } from "@/lib/currentUser";
import { isPersona } from "@/lib/persona";
import * as messagesRepo from "@/db/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const persona = new URL(req.url).searchParams.get("persona");
  if (!isPersona(persona)) {
    return Response.json({ error: "persona 필요(theo|nora)" }, { status: 400 });
  }

  const rows = await messagesRepo.listForView(user.id, persona);
  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
