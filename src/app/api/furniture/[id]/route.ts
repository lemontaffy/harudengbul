import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as furnitureRepo from "@/db/repo/roomFurniture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  posX: z.number().min(0).max(100).optional(),
  posY: z.number().min(0).max(100).optional(),
  pixelRender: z.boolean().optional(),
});

// 위치 이동(드래그) · pixel_render 토글.
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
