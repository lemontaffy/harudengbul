import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 마모 1 — '방을 보는 동안'에만 클라가 호출. 무한 내구도면 무동작(null). 0 도달 = 파손 순간.
//   내구도는 전역 items 에(같은 item 여러 방 배치는 공유).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const before = await itemsRepo.getOne(user.id, id);
  if (!before) return Response.json({ error: "없는 아이템" }, { status: 404 });
  const now = await itemsRepo.wear(user.id, id); // 무한이면 null
  const broke = now === 0 && (before.durabilityNow ?? 0) > 0;
  return Response.json({ ok: true, durabilityNow: now, broke });
}
