import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as roomsRepo from "@/db/repo/petRooms";
import { stageFor } from "@/lib/pets";
import { regenerateLines } from "@/lib/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  personality: z.string().trim().max(500).nullable().optional(),
  pixelRender: z.boolean().optional(),
  teenThreshold: z.number().int().min(1).max(100000).optional(),
  adultThreshold: z.number().int().min(1).max(100000).optional(),
  roomId: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  if (d.roomId !== undefined) {
    const r = await roomsRepo.getOne(user.id, d.roomId);
    if (!r) return Response.json({ error: "없는 방" }, { status: 400 });
  }
  await petsRepo.update(user.id, id, {
    ...(d.name !== undefined ? { name: d.name } : {}),
    ...(d.personality !== undefined ? { personality: d.personality } : {}),
    ...(d.pixelRender !== undefined ? { pixelRender: d.pixelRender } : {}),
    ...(d.teenThreshold !== undefined ? { teenThreshold: d.teenThreshold } : {}),
    ...(d.adultThreshold !== undefined ? { adultThreshold: d.adultThreshold } : {}),
    ...(d.roomId !== undefined ? { roomId: d.roomId } : {}),
  });

  // 성격 변경 시 현재 스테이지 대사 풀 갱신(best-effort).
  if (d.personality !== undefined) {
    const stage = stageFor(pet.growthPoints, d.teenThreshold ?? pet.teenThreshold, d.adultThreshold ?? pet.adultThreshold);
    void regenerateLines(user.id, id, stage).catch(() => {});
  }
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await petsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
