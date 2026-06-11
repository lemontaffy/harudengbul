import { getCurrentUser } from "@/lib/currentUser";
import * as txRepo from "@/db/repo/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await txRepo.remove(user.id, id); // 소유 스코프 — 남의 것은 영향 없음
  return Response.json({ ok: true });
}
