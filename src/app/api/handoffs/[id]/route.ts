import { getCurrentUser } from "@/lib/currentUser";
import * as handoffsRepo from "@/db/repo/handoffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 넘기기(거절) → dismissed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const ok = await handoffsRepo.dismiss(user.id, id);
  if (!ok) return Response.json({ error: "이미 처리됨" }, { status: 409 });
  return Response.json({ ok: true });
}
