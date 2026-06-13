import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  liveliness: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });
  if (parsed.data.name !== undefined) await roomsRepo.rename(user.id, id, parsed.data.name);
  if (parsed.data.liveliness !== undefined) await roomsRepo.setLiveliness(user.id, id, parsed.data.liveliness);
  return Response.json({ ok: true });
}

// 방 삭제 — 펫이 있으면 차단(연쇄 삭제 금지, 최애 증발 방지).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });
  const count = await petsRepo.countByRoom(user.id, id);
  if (count > 0) {
    return Response.json(
      { error: "펫을 다른 방으로 옮긴 후 삭제할 수 있어요." },
      { status: 409 },
    );
  }
  await roomsRepo.remove(user.id, id);
  return Response.json({ ok: true });
}
