import { getCurrentUser } from "@/lib/currentUser";
import * as personasRepo from "@/db/repo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 채팅 스레드를 읽음으로 표시 — last_read_at = now(). 안읽음 배지 0.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const personaId = Number(id);
  if (!Number.isInteger(personaId)) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const persona = await personasRepo.getOne(user.id, personaId);
  if (!persona) return Response.json({ error: "없는 캐릭터" }, { status: 404 });

  await personasRepo.markRead(user.id, personaId);
  return Response.json({ ok: true });
}
