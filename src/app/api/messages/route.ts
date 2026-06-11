import { getCurrentUser } from "@/lib/currentUser";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("personaId");
  const personaId = Number(raw);
  if (!raw || !Number.isInteger(personaId)) {
    return Response.json({ error: "personaId 필요" }, { status: 400 });
  }
  // 본인 소유 캐릭터인지 확인(타인 스레드 열람 차단).
  const persona = await personasRepo.getOne(user.id, personaId);
  if (!persona) {
    return Response.json({ error: "없는 캐릭터" }, { status: 404 });
  }

  const rows = await messagesRepo.listForView(user.id, personaId);
  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
