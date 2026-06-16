import { getCurrentUser } from "@/lib/currentUser";
import * as sceneBgRepo from "@/db/repo/sceneBackgrounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 장면 배경 삭제(레코드만 — 파일은 남아도 무해, 화이트리스트에서 빠져 서빙 차단).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await sceneBgRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
