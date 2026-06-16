import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import * as relationsRepo from "@/db/repo/petRelations";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as momentsRepo from "@/db/repo/petMoments";
import * as settingsRepo from "@/db/repo/settings";
import { breakageLine } from "@/lib/itemGive";
import { generateBreakScene as genBreakScene, pickSceneBg } from "@/lib/petMoment";
import { isLoveLabel, isHostileLabel } from "@/lib/pets";
import { dayBoundsInTz } from "@/lib/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 큰 만담(주인 아이템 + 주인 같은 방)을 가끔 자막 씬으로 승격(메인 모델). 하루 1회 캡 공유(관계 이벤트와).
const PROMOTE_CHANCE = 0.35;

// 마모 1 — 0 도달 시 broken. 파손되면 깬 펫 맥락으로 라이브 만담 1줄. (큰 건은 가끔 씬으로 승격.)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { breakerPetId?: number };

  const inst = await roomItemsRepo.getOne(user.id, id);
  if (!inst) return Response.json({ error: "없는 아이템" }, { status: 404 });
  const worn = await roomItemsRepo.wear(user.id, id);

  if (!worn?.broke) return Response.json({ ok: true, durabilityNow: worn?.now ?? null, broke: false });

  const breakerId = Number(body.breakerPetId);
  const [breaker, asset] = await Promise.all([
    Number.isInteger(breakerId) ? petsRepo.getOne(user.id, breakerId) : Promise.resolve(null),
    itemsRepo.getOne(user.id, inst.assetId),
  ]);
  if (!breaker || !asset)
    return Response.json({ ok: true, durabilityNow: worn.now, broke: true, breakLine: null, ownerPetId: null });

  const ctx = inst.ownerPetId === breaker.id ? "self" : inst.ownerPetId != null ? "other" : "solo";
  const owner = ctx === "other" && inst.ownerPetId != null ? await petsRepo.getOne(user.id, inst.ownerPetId) : null;

  // ── 큰 만담 승격: 주인 아이템 + 주인 같은 방 + 관계(애정/대치) + 일일캡 + 가중 확률 → 자막 씬 ──
  if (
    ctx === "other" &&
    owner &&
    (await membershipsRepo.sharesRoom(user.id, owner.id, breaker.id)) &&
    Math.random() < PROMOTE_CHANCE
  ) {
    const rel = await relationsRepo.getPair(user.id, breaker.id, owner.id);
    const label = rel?.relationLabel ?? "";
    if (isLoveLabel(label) || isHostileLabel(label)) {
      const s = await settingsRepo.getByUser(user.id);
      const { start } = dayBoundsInTz(s?.timezone ?? "Asia/Seoul");
      if ((await momentsRepo.countSince(user.id, start)) < 1) {
        const kind: "hostile" | "love" = isLoveLabel(label) ? "love" : "hostile";
        const script = await genBreakScene(
          user.id,
          { id: breaker.id, name: breaker.name, personality: breaker.personality },
          { id: owner.id, name: owner.name, personality: owner.personality },
          asset.name,
          label,
        );
        const moment = await momentsRepo.create(user.id, {
          roomId: inst.roomId,
          petAId: breaker.id,
          petBId: owner.id,
          petAName: breaker.name,
          petBName: owner.name,
          relationKind: kind,
          script,
        });
        const sceneBg = await pickSceneBg(user.id, kind);
        return Response.json({ ok: true, durabilityNow: worn.now, broke: true, scene: { momentId: moment.id, script, relationKind: kind, sceneBg } });
      }
    }
  }

  // 승격 안 하면 평소 라이브 만담 1줄.
  const ownerName = owner?.name ?? undefined;
  const breakLine = await breakageLine(
    user.id,
    { name: asset.name },
    { name: breaker.name, personality: breaker.personality },
    ctx,
    ownerName,
  );
  return Response.json({ ok: true, durabilityNow: worn.now, broke: true, breakLine, ownerPetId: ctx === "other" ? inst.ownerPetId : null });
}
