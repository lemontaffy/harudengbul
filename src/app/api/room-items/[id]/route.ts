import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 아이템 인스턴스 — 위치·크기·placed(배치↔내림)·소유 수정.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const inst = await roomItemsRepo.getOne(user.id, id);
  if (!inst) return Response.json({ error: "없는 아이템" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    posX?: number;
    posY?: number;
    scale?: number;
    placed?: boolean;
    ownerPetId?: number | null;
  };

  if (typeof body.placed === "boolean") {
    const pos =
      typeof body.posX === "number" && typeof body.posY === "number"
        ? { posX: body.posX, posY: body.posY }
        : undefined;
    await roomItemsRepo.setPlaced(user.id, id, body.placed, pos);
  } else if (typeof body.posX === "number" && typeof body.posY === "number") {
    await roomItemsRepo.setPosition(user.id, id, body.posX, body.posY);
  }
  if (typeof body.scale === "number" && Number.isFinite(body.scale)) {
    await roomItemsRepo.setScale(user.id, id, body.scale);
  }
  if ("ownerPetId" in body) {
    let pid: number | null = null;
    if (body.ownerPetId != null) {
      const n = Number(body.ownerPetId);
      // 소유는 '방 안' — 그 펫이 이 방의 멤버여야(다대다).
      if (Number.isInteger(n) && (await membershipsRepo.isPetInRoom(user.id, n, inst.roomId))) pid = n;
    }
    await roomItemsRepo.setOwner(user.id, id, pid);
  }
  return Response.json({ ok: true });
}

// 인스턴스 제거(방에서 치움 — 풀 asset 은 남음).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await roomItemsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
