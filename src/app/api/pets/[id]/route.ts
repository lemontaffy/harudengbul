import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as roomsRepo from "@/db/repo/petRooms";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as spritesRepo from "@/db/repo/petSprites";
import * as linesRepo from "@/db/repo/petLines";
import * as relationsRepo from "@/db/repo/petRelations";
import * as customSpritesRepo from "@/db/repo/petCustomSprites";
import * as itemsRepo from "@/db/repo/items";
import * as itemReactionsRepo from "@/db/repo/itemReactionLines";
import { stageFor, reachedStages } from "@/lib/pets";
import { regenerateLines } from "@/lib/petLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 편집 시트 상세 — 스프라이트 슬롯·대사 풀·관계.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const pet = await petsRepo.getOne(user.id, id);
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });
  const [sprites, lines, relations, customSprites, rooms, itemReactions, itemPool] = await Promise.all([
    spritesRepo.listForPet(user.id, id),
    linesRepo.listForPet(user.id, id),
    relationsRepo.listForPet(user.id, id),
    customSpritesRepo.listForPet(user.id, id),
    membershipsRepo.roomIdsForPet(user.id, id), // 다대다 — 이 펫이 든 방들
    itemReactionsRepo.listForPet(user.id, id), // 아이템 반응 대사(편집)
    itemsRepo.listForUser(user.id, "item"), // 추가 피커용 아이템 풀
  ]);
  const stage = stageFor(pet.growthPoints, pet.teenThreshold, pet.adultThreshold);
  return Response.json({
    pet: {
      id: pet.id,
      name: pet.name,
      personality: pet.personality,
      pixelRender: pet.pixelRender,
      roomId: pet.roomId, // deprecated
      rooms, // 정본: 멤버십 방 id 목록

      growthPoints: pet.growthPoints,
      teenThreshold: pet.teenThreshold,
      adultThreshold: pet.adultThreshold,
      stage,
      talkativeness: pet.talkativeness,
      activeness: pet.activeness,
      displayStage: pet.displayStage,
      walkFacing: pet.walkFacing,
      sitFacing: pet.sitFacing,
      locomotion: pet.locomotion,
      reachedStages: reachedStages(pet.growthPoints, pet.teenThreshold, pet.adultThreshold),
    },
    sprites,
    lines,
    relations,
    customSprites,
    itemReactions,
    itemPool: itemPool.map((i) => ({ id: i.id, name: i.name, consumable: i.consumable })),
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  personality: z.string().trim().max(500).nullable().optional(),
  pixelRender: z.boolean().optional(),
  teenThreshold: z.number().int().min(1).max(100000).optional(),
  adultThreshold: z.number().int().min(1).max(100000).optional(),
  roomId: z.number().int().nullable().optional(), // deprecated(단일). 다대다는 rooms 사용.
  rooms: z.array(z.number().int()).max(50).optional(), // 정본: 이 펫이 들어갈 방 id 집합(멤버십 동기화)
  talkativeness: z.number().int().min(0).max(100).optional(),
  activeness: z.number().int().min(0).max(100).optional(),
  displayStage: z.enum(["baby", "teen", "adult"]).nullable().optional(),
  walkFacing: z.enum(["left", "right"]).optional(),
  sitFacing: z.enum(["left", "right"]).optional(),
  locomotion: z.enum(["ground", "air"]).optional(),
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

  // roomId: number=그 방(소유 확인) / null=대기. 둘 다 허용.
  if (d.roomId != null) {
    const r = await roomsRepo.getOne(user.id, d.roomId);
    if (!r) return Response.json({ error: "없는 방" }, { status: 400 });
  }
  // display_stage 는 도달한 스테이지만 허용(미도달 강제 차단).
  if (d.displayStage != null) {
    const reached = reachedStages(pet.growthPoints, pet.teenThreshold, pet.adultThreshold);
    if (!(reached as string[]).includes(d.displayStage)) {
      return Response.json({ error: "아직 도달하지 않은 모습이에요." }, { status: 400 });
    }
  }
  await petsRepo.update(user.id, id, {
    ...(d.name !== undefined ? { name: d.name } : {}),
    ...(d.personality !== undefined ? { personality: d.personality } : {}),
    ...(d.pixelRender !== undefined ? { pixelRender: d.pixelRender } : {}),
    ...(d.teenThreshold !== undefined ? { teenThreshold: d.teenThreshold } : {}),
    ...(d.adultThreshold !== undefined ? { adultThreshold: d.adultThreshold } : {}),
    ...(d.roomId !== undefined ? { roomId: d.roomId } : {}),
    ...(d.talkativeness !== undefined ? { talkativeness: d.talkativeness } : {}),
    ...(d.activeness !== undefined ? { activeness: d.activeness } : {}),
    ...(d.displayStage !== undefined ? { displayStage: d.displayStage } : {}),
    ...(d.walkFacing !== undefined ? { walkFacing: d.walkFacing } : {}),
    ...(d.sitFacing !== undefined ? { sitFacing: d.sitFacing } : {}),
    ...(d.locomotion !== undefined ? { locomotion: d.locomotion } : {}),
  });

  // 방 멤버십 동기화(다대다) — rooms 가 주어지면 집합을 그 값으로 맞춘다(소유 방만, 추가/제거 diff).
  if (d.rooms !== undefined) {
    const owned = await roomsRepo.listByUser(user.id);
    const ownedIds = new Set(owned.map((r) => r.id));
    const target = new Set(d.rooms.filter((rid) => ownedIds.has(rid)));
    const current = new Set(await membershipsRepo.roomIdsForPet(user.id, id));
    for (const rid of target) if (!current.has(rid)) await membershipsRepo.addToRoom(user.id, id, rid);
    for (const rid of current) if (!target.has(rid)) await membershipsRepo.removeFromRoom(user.id, id, rid);
  }

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
