import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as furnitureRepo from "@/db/repo/roomFurniture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  posX: z.number().min(0).max(100).optional(),
  posY: z.number().min(0).max(100).optional(),
  pixelRender: z.boolean().optional(),
  kind: z.enum(["seat", "fixture"]).optional(),
  type: z.string().trim().max(40).optional(),
  actionType: z.enum(["letters", "memo", "diary", "pet_diary", "achievements", "none"]).nullable().optional(),
  facing: z.enum(["left", "right"]).optional(), // seat: 앉은 펫 방향
  seatY: z.number().min(0).max(100).optional(), // seat: 좌석면 높이(%)
  scale: z.number().min(0.3).max(3).optional(), // 크기 배율
  rotation: z.number().min(-180).max(180).optional(), // 회전(도)
});

// 위치 이동(드래그) · pixel_render 토글 · 메타(유형·라벨·액션) 편집.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;
  if (d.posX != null && d.posY != null) await furnitureRepo.setPosition(user.id, id, d.posX, d.posY);
  if (d.pixelRender != null) await furnitureRepo.setPixel(user.id, id, d.pixelRender);
  // seat은 액션 없음(null 강제).
  const metaPatch: {
    kind?: "seat" | "fixture";
    type?: string;
    actionType?: string | null;
    facing?: "left" | "right";
    seatY?: number;
    scale?: number;
    rotation?: number;
  } = {};
  if (d.kind !== undefined) {
    metaPatch.kind = d.kind;
    if (d.kind === "seat") metaPatch.actionType = null;
  }
  if (d.type !== undefined) metaPatch.type = d.type;
  if (d.actionType !== undefined && metaPatch.actionType === undefined) metaPatch.actionType = d.actionType;
  if (d.facing !== undefined) metaPatch.facing = d.facing;
  if (d.seatY !== undefined) metaPatch.seatY = d.seatY;
  if (d.scale !== undefined) metaPatch.scale = d.scale;
  if (d.rotation !== undefined) metaPatch.rotation = d.rotation;
  if (Object.keys(metaPatch).length > 0) await furnitureRepo.updateMeta(user.id, id, metaPatch);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  await furnitureRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
