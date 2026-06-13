import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as bgRepo from "@/db/repo/roomBackgrounds";
import * as petsRepo from "@/db/repo/pets";
import { remapPosAfterDelete } from "@/lib/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  floorTopY: z.number().min(0).max(100),
  floorBottomY: z.number().min(0).max(100),
});

// 바닥 구역 경계 조정.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; bgId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const bgId = Number((await params).bgId);
  if (!Number.isInteger(bgId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await bgRepo.setFloor(user.id, bgId, parsed.data.floorTopY, parsed.data.floorBottomY);
  return Response.json({ ok: true });
}

// 패널 삭제 — 그 구간의 펫 pos_x 를 인접 패널로 보정(허공 방지) 후 삭제.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; bgId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = await params;
  const roomId = Number(p.id);
  const bgId = Number(p.bgId);
  if (!Number.isInteger(roomId) || !Number.isInteger(bgId)) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const room = await roomsRepo.getOne(user.id, roomId);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  const panels = await bgRepo.listForRoom(user.id, roomId);
  const idx = panels.findIndex((b) => b.id === bgId);
  if (idx < 0) return Response.json({ error: "없는 패널" }, { status: 404 });

  // 펫 좌표 보정(패널이 2개 이상일 때만 좌표계가 바뀜).
  if (panels.length > 1) {
    const roomPets = await petsRepo.listByRoom(user.id, roomId);
    for (const pet of roomPets) {
      const nx = remapPosAfterDelete(pet.posX, idx, panels.length);
      if (nx !== pet.posX) await petsRepo.setPosition(user.id, pet.id, nx, pet.posY);
    }
  }
  await bgRepo.remove(user.id, bgId);
  return Response.json({ ok: true });
}
