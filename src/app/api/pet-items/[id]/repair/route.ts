import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/petItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수리 — 무료·즉시. durability_now = durability_max 복구. 무한 내구도면 무동작.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const ok = await itemsRepo.repair(user.id, id);
  if (!ok) return Response.json({ error: "수리할 수 없는 아이템" }, { status: 400 });
  const item = await itemsRepo.getOne(user.id, id);
  return Response.json({ ok: true, durabilityNow: item?.durabilityNow ?? null });
}
