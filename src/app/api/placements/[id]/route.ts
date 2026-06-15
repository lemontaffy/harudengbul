import { getCurrentUser } from "@/lib/currentUser";
import * as placementsRepo from "@/db/repo/furniturePlacements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가구 배치 인스턴스 — 위치/크기/회전 수정. 모양·종류는 라이브러리 item(/api/pets/items/[itemId]) 담당.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    posX?: number;
    posY?: number;
    scale?: number;
    rotation?: number;
    zOrder?: number;
  };
  if (typeof body.posX === "number" && typeof body.posY === "number") {
    await placementsRepo.setPosition(user.id, id, body.posX, body.posY);
  }
  const t: { scale?: number; rotation?: number; zOrder?: number } = {};
  if (typeof body.scale === "number" && Number.isFinite(body.scale))
    t.scale = Math.max(0.3, Math.min(3, body.scale));
  if (typeof body.rotation === "number" && Number.isFinite(body.rotation))
    t.rotation = Math.max(-180, Math.min(180, body.rotation));
  if (typeof body.zOrder === "number" && Number.isFinite(body.zOrder)) t.zOrder = Math.trunc(body.zOrder);
  if (Object.keys(t).length) await placementsRepo.setTransform(user.id, id, t);

  return Response.json({ ok: true });
}

// 방에서 빼기(배치 인스턴스 삭제 — 라이브러리 원본 item 은 남음).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await placementsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
