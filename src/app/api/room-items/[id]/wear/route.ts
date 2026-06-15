import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 마모 1 — 인스턴스 내구도 1 감소, 0 도달 시 broken. 무한이면 무동작(null).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const worn = await roomItemsRepo.wear(user.id, id);
  return Response.json({ ok: true, durabilityNow: worn?.now ?? null, broke: worn?.broke ?? false });
}
