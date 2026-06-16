import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 방 생성 — 이름 + (선택) 기존 펫들을 바로 입주(다대다 멤버십). 본인 펫만.
const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  petIds: z.array(z.number().int()).max(50).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "방 이름을 입력하세요." }, { status: 400 });
  const room = await roomsRepo.create(user.id, parsed.data.name);
  for (const petId of parsed.data.petIds ?? []) {
    if (await petsRepo.getOne(user.id, petId)) await membershipsRepo.addToRoom(user.id, petId, room.id);
  }
  return Response.json({ room: { id: room.id, name: room.name } });
}
