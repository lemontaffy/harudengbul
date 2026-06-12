import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as roomsRepo from "@/db/repo/petRooms";
import { regenerateLines } from "@/lib/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(30),
  personality: z.string().trim().max(500).nullable().optional(),
  roomId: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "펫 이름을 입력하세요." }, { status: 400 });
  const d = parsed.data;

  // 방 결정: 지정 방(소유 확인) → 없으면 첫 방 → 방 0개면 기본 방 자동 생성.
  let roomId = d.roomId ?? null;
  if (roomId != null) {
    const r = await roomsRepo.getOne(user.id, roomId);
    if (!r) return Response.json({ error: "없는 방" }, { status: 400 });
  } else {
    const rooms = await roomsRepo.listByUser(user.id);
    roomId = rooms[0]?.id ?? (await roomsRepo.create(user.id, "내 방")).id;
  }

  const pet = await petsRepo.create(user.id, {
    roomId,
    name: d.name,
    personality: d.personality ?? null,
  });
  void regenerateLines(user.id, pet.id, "baby").catch(() => {}); // 대사 풀 생성(best-effort)
  return Response.json({ pet: { id: pet.id, name: pet.name, roomId } });
}
