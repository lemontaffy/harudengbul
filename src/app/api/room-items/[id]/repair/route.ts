import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수리 — durability_now=max, broken=false. 무한이면 무동작. 탭 1회 무료 복구.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const ok = await roomItemsRepo.repair(user.id, id);
  if (!ok) return Response.json({ error: "수리할 수 없는 아이템" }, { status: 400 });
  const inst = await roomItemsRepo.getOne(user.id, id);
  return Response.json({ ok: true, durabilityNow: inst?.durabilityNow ?? null });
}
