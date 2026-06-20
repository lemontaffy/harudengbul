import { getCurrentUser } from "@/lib/currentUser";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 현재 대화 상대(personaId)의 고정 메시지 목록. userId+personaId 스코프.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("personaId");
  const personaId = Number(raw);
  if (!raw || !Number.isInteger(personaId)) {
    return Response.json({ error: "personaId 필요" }, { status: 400 });
  }
  const persona = await personasRepo.getOne(user.id, personaId);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  const rows = await messagesRepo.listPinned(user.id, personaId);
  return Response.json({
    pins: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
