import { getCurrentUser } from "@/lib/currentUser";
import * as itemsRepo from "@/db/repo/items";
import * as petsRepo from "@/db/repo/pets";
import * as settingsRepo from "@/db/repo/settings";
import * as givesRepo from "@/db/repo/itemGives";
import { todayInTz } from "@/lib/proactive";
import { ensureGiveLine, effectFor, repeatLine, ownerCallLine, type GiveKind } from "@/lib/itemGive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 같은 (펫×아이템)에 또 주면 '새 변주' 대신 차분한 반복으로 정착하는 쿨다운(연타 농사 차단).
const COOLDOWN_MS = 3 * 60_000;
// '주인 부르기' 특수 연출 일일 캡(reopen·연타로 농사 불가) + 발동 확률.
const OWNER_CALL_CAP = 2;
const OWNER_CALL_CHANCE = 0.6;

// 아이템을 펫에게 '주기' → 반응 분기. 아이템은 소비되지 않음(반복 가능, 단 6번 안티-슬롯 가드).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const itemId = Number((await params).id);
  if (!Number.isInteger(itemId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { petId?: number };
  const petId = Number(body.petId);
  if (!Number.isInteger(petId)) return Response.json({ error: "받는 펫을 고르세요." }, { status: 400 });

  const [item, pet] = await Promise.all([itemsRepo.getOne(user.id, itemId), petsRepo.getOne(user.id, petId)]);
  if (!item || item.kind !== "item") return Response.json({ error: "없는 아이템" }, { status: 404 });
  if (!pet) return Response.json({ error: "없는 펫" }, { status: 404 });

  // ── 안티-슬롯: (펫×아이템) 쿨다운 중이면 차분한 반복으로 정착(새 보상 X) ──
  const last = await givesRepo.lastGiveAt(user.id, petId, itemId);
  if (last && Date.now() - new Date(last).getTime() < COOLDOWN_MS) {
    await givesRepo.log(user.id, petId, itemId);
    return Response.json({ kind: "repeat", content: repeatLine(), effect: null, ownerCall: null });
  }

  // ── 분기: 받는펫=주인 / 주인없음 / 다른펫(주인 언급) ──
  let kind: GiveKind;
  let ownerName: string | undefined;
  let ownerPet: Awaited<ReturnType<typeof petsRepo.getOne>> | null = null;
  if (item.ownerPetId === petId) {
    kind = "owner_recognize";
  } else if (item.ownerPetId == null) {
    kind = "received";
  } else {
    kind = "other_owner";
    ownerPet = await petsRepo.getOne(user.id, item.ownerPetId);
    ownerName = ownerPet?.name ?? undefined;
  }

  const content = await ensureGiveLine(
    user.id,
    { id: item.id, name: item.name },
    { id: pet.id, name: pet.name, personality: pet.personality },
    kind,
    ownerName,
  );
  const effect = effectFor(kind);

  // ── 주인 부르기: 주인이 같은 방 + 일일 캡 미만 + 가중 확률일 때만 ──
  let ownerCall: { ownerPetId: number; content: string } | null = null;
  if (kind === "other_owner" && ownerPet && pet.roomId != null && ownerPet.roomId === pet.roomId) {
    const s = await settingsRepo.getByUser(user.id);
    const today = todayInTz(s?.timezone ?? "Asia/Seoul");
    const used = s?.ownerCallDate === today ? s?.ownerCallToday ?? 0 : 0;
    if (used < OWNER_CALL_CAP && Math.random() < OWNER_CALL_CHANCE) {
      ownerCall = { ownerPetId: ownerPet.id, content: ownerCallLine(item.name, pet.name) };
      await settingsRepo.updateByUser(user.id, { ownerCallDate: today, ownerCallToday: used + 1 });
    }
  }

  await givesRepo.log(user.id, petId, itemId);
  return Response.json({ kind, content, effect, ownerCall });
}
