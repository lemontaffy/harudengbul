import { getCurrentUser } from "@/lib/currentUser";
import * as roomItemsRepo from "@/db/repo/roomItems";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import * as settingsRepo from "@/db/repo/settings";
import * as givesRepo from "@/db/repo/itemGives";
import { todayInTz } from "@/lib/proactive";
import { ensureGiveLine, effectFor, ownerCallLine, type GiveKind } from "@/lib/itemGive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_CALL_CAP = 2;
const OWNER_CALL_CHANCE = 0.6;

// v6 던지기 — 바구니(placed=false) 인스턴스를 펫에게. 분기(Block 2) + 내구도 차감(인스턴스). 소비 안 됨.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const instId = Number((await params).id);
  if (!Number.isInteger(instId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { petId?: number };
  const petId = Number(body.petId);
  if (!Number.isInteger(petId)) return Response.json({ error: "받는 펫을 고르세요." }, { status: 400 });

  const inst = await roomItemsRepo.getOne(user.id, instId);
  if (!inst) return Response.json({ error: "없는 아이템" }, { status: 404 });
  const [asset, pet] = await Promise.all([
    itemsRepo.getOne(user.id, inst.assetId),
    petsRepo.getOne(user.id, petId),
  ]);
  if (!asset) return Response.json({ error: "없는 아이템" }, { status: 404 });
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  // 안티-슬롯: durable 은 인위적 쿨다운 없음 — 내구도 마모가 절제(막 던지면 깨져 탭 복구).
  //   파손 상태면 던지기 대신 수리 안내(탭=복구지 던지기 아님).
  if (inst.broken) return Response.json({ error: "파손된 아이템이에요. 탭해서 수리한 뒤 줄 수 있어요." }, { status: 400 });

  // 분기 — 소유는 인스턴스(room_items.owner_pet_id).
  let kind: GiveKind;
  let ownerName: string | undefined;
  let ownerPet: Awaited<ReturnType<typeof petsRepo.getOne>> | null = null;
  if (inst.ownerPetId === petId) kind = "owner_recognize";
  else if (inst.ownerPetId == null) kind = "received";
  else {
    kind = "other_owner";
    ownerPet = await petsRepo.getOne(user.id, inst.ownerPetId);
    ownerName = ownerPet?.name ?? undefined;
  }

  const content = await ensureGiveLine(
    user.id,
    { id: asset.id, name: asset.name },
    { id: pet.id, name: pet.name, personality: pet.personality },
    kind,
    ownerName,
  );
  const effect = effectFor(kind);

  // 주인 부르기 — 주인이 같은 방 + 일일 캡 + 가중 확률.
  let ownerCall: { ownerPetId: number; content: string } | null = null;
  if (kind === "other_owner" && ownerPet && pet.roomId != null && ownerPet.roomId === pet.roomId) {
    const s = await settingsRepo.getByUser(user.id);
    const today = todayInTz(s?.timezone ?? "Asia/Seoul");
    const used = s?.ownerCallDate === today ? s?.ownerCallToday ?? 0 : 0;
    if (used < OWNER_CALL_CAP && Math.random() < OWNER_CALL_CHANCE) {
      ownerCall = { ownerPetId: ownerPet.id, content: ownerCallLine(asset.name, pet.name) };
      await settingsRepo.updateByUser(user.id, { ownerCallDate: today, ownerCallToday: used + 1 });
    }
  }

  // 내구도 차감(인스턴스) — 던지기는 의미 있는 제스처라 1 차감. 0 도달 시 broken.
  const worn = await roomItemsRepo.wear(user.id, instId); // 무한이면 null
  await givesRepo.log(user.id, petId, inst.assetId);
  return Response.json({
    kind,
    content,
    effect,
    ownerCall,
    durabilityNow: worn?.now ?? null,
    broke: worn?.broke ?? false,
  });
}
