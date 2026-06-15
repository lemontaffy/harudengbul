import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ posX: z.number(), posY: z.number(), roomId: z.number().int().optional() });

// 드래그 저장(경량). 소유 펫만. 위치는 방별(멤버십) — roomId 주면 그 방 멤버십에, 없으면 deprecated 폴백.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  if (parsed.data.roomId != null) {
    await membershipsRepo.setPosition(user.id, id, parsed.data.roomId, parsed.data.posX, parsed.data.posY);
  } else {
    await petsRepo.setPosition(user.id, id, parsed.data.posX, parsed.data.posY); // deprecated 폴백
  }
  return Response.json({ ok: true });
}
