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

// 방 삭제 — 펫은 전역이라 지우지 않고 보존(FK SET NULL 로 그 방 펫들의 room_id 만 null=대기).
// 분리된 펫 수(detached)를 반환해 클라이언트 안내에 사용.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });
  const detached = await petsRepo.countByRoom(user.id, id); // 보존되는 펫 수
  await roomsRepo.remove(user.id, id); // FK SET NULL → 펫 room_id null 로 보존
  return Response.json({ ok: true, detached });
}
