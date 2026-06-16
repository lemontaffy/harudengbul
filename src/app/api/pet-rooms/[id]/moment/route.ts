import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as relationsRepo from "@/db/repo/petRelations";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as momentsRepo from "@/db/repo/petMoments";
import * as settingsRepo from "@/db/repo/settings";
import { isLoveLabel, isHostileLabel } from "@/lib/pets";
import { dayBoundsInTz } from "@/lib/proactive";
import { generateScene } from "@/lib/petMoment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// '보기' 탭 시에만 — 같은 방 관계 두 펫의 씬을 메인 모델로 1회 생성·저장. 하루 1회 캡.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roomId = Number((await params).id);
  if (!Number.isInteger(roomId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await roomsRepo.getOne(user.id, roomId))) return Response.json({ error: "없는 방" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { petAId?: number; petBId?: number };
  const aId = Number(body.petAId);
  const bId = Number(body.petBId);
  if (!Number.isInteger(aId) || !Number.isInteger(bId) || aId === bId)
    return Response.json({ error: "두 펫을 고르세요." }, { status: 400 });

  // 하루 1회 캡 — 사용자 tz 당일.
  const s = await settingsRepo.getByUser(user.id);
  const { start } = dayBoundsInTz(s?.timezone ?? "Asia/Seoul");
  if ((await momentsRepo.countSince(user.id, start)) >= 1)
    return Response.json({ error: "오늘은 이미 한 편 봤어요. 내일 또 만나요." }, { status: 409 });

  // 둘 다 이 방 멤버 + 관계 존재 검증.
  const [inA, inB, rel, petA, petB] = await Promise.all([
    membershipsRepo.isPetInRoom(user.id, aId, roomId),
    membershipsRepo.isPetInRoom(user.id, bId, roomId),
    relationsRepo.getPair(user.id, aId, bId),
    petsRepo.getOne(user.id, aId),
    petsRepo.getOne(user.id, bId),
  ]);
  if (!inA || !inB || !petA || !petB) return Response.json({ error: "같은 방의 두 펫이 아니에요." }, { status: 400 });
  if (!rel) return Response.json({ error: "관계가 없는 펫이에요." }, { status: 400 });
  const label = rel.relationLabel;
  const kind: "hostile" | "love" = isLoveLabel(label) ? "love" : isHostileLabel(label) ? "hostile" : "hostile";
  if (!isLoveLabel(label) && !isHostileLabel(label))
    return Response.json({ error: "대치/애정 관계만 씬이 돼요." }, { status: 400 });

  const script = await generateScene(
    user.id,
    { id: petA.id, name: petA.name, personality: petA.personality },
    { id: petB.id, name: petB.name, personality: petB.personality },
    kind,
    label,
  );
  const row = await momentsRepo.create(user.id, {
    roomId,
    petAId: aId,
    petBId: bId,
    petAName: petA.name,
    petBName: petB.name,
    relationKind: kind,
    script,
  });
  return Response.json({ ok: true, momentId: row.id, relationKind: kind, script });
}
