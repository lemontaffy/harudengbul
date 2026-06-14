import { getCurrentUser } from "@/lib/currentUser";
import * as suggRepo from "@/db/repo/achievementSuggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 업적 후보 넘기기(거절).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const ok = await suggRepo.dismiss(user.id, id);
  if (!ok) return Response.json({ error: "이미 처리됨" }, { status: 409 });
  return Response.json({ ok: true });
}
