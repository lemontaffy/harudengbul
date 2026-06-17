import { getCurrentUser } from "@/lib/currentUser";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";
import * as relationsRepo from "@/db/repo/petRelations";
import * as diariesRepo from "@/db/repo/petDiaries";
import * as settingsRepo from "@/db/repo/settings";
import { getLlmConfig } from "@/lib/config";
import { completeChat } from "@/lib/llm";
import { stageFor, forbiddenLine } from "@/lib/pets";
import { buildDiaryMessages, fallbackDiary, diaryDateInTz, type DiaryRelation, type DiaryOther } from "@/lib/petDiary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PETS = 8; // 1일 호출 천장(보통 5인분).

// 오늘의 펫 일기 생성·고정(1일 1회). 이미 있으면 재생성하지 않고 그대로.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const settings = await settingsRepo.getByUser(user.id);
  const date = diaryDateInTz(settings?.timezone ?? "Asia/Seoul");

  if (await diariesRepo.existsForDate(user.id, date)) {
    return Response.json({ ok: true, date, generated: false }); // 이미 오늘치 있음 — 고정
  }

  const allPets = await petsRepo.listByUser(user.id);
  if (allPets.length === 0) return Response.json({ ok: true, date, generated: false });
  const pets = allPets.slice(0, MAX_PETS);
  const nameOf = new Map(allPets.map((p) => [p.id, p.name]));
  const cfg = await getLlmConfig(user.id);

  async function genFor(pet: (typeof pets)[number]): Promise<string> {
    const fb = fallbackDiary(pet.name);
    if (!cfg.configured) return fb;
    const rels = await relationsRepo.listForPet(user!.id, pet.id);
    const relations: DiaryRelation[] = rels
      .map((r) => {
        const otherId = r.petAId === pet.id ? r.petBId : r.petAId;
        const name = nameOf.get(otherId);
        return name ? { name, label: r.relationLabel } : null;
      })
      .filter((x): x is DiaryRelation => !!x);
    // 룸메이트 = 이 펫과 한 방이라도 같이 있는 다른 펫(다대다 멤버십).
    const roommates = (await membershipsRepo.roommatesOf(user!.id, pet.id)).map((p) => p.name);
    // 다른 펫 전체의 실제 정보(성격·단계) — 일기에서 사실 왜곡(다른 펫에 대한 틀린 서술) 방지.
    const others: DiaryOther[] = allPets
      .filter((p) => p.id !== pet.id)
      .map((p) => ({
        name: p.name,
        personality: p.personality,
        stage: stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold),
      }));
    const msgs = buildDiaryMessages({
      name: pet.name,
      personality: pet.personality,
      stage: stageFor(pet.growthPoints, pet.teenThreshold, pet.adultThreshold),
      roommates,
      relations,
      others,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = (await completeChat(cfg, msgs)).trim();
        // 금지 주제(죽음/자해·비속어) 걸리면 폴백. 빈 출력도 폴백.
        if (out && !forbiddenLine(out)) return out.slice(0, 600);
      } catch {
        /* 재시도 */
      }
    }
    return fb;
  }

  const contents = await Promise.all(pets.map(genFor));
  await diariesRepo.insertMany(
    pets.map((p, i) => ({ userId: user.id, petId: p.id, content: contents[i], date })),
  );
  return Response.json({ ok: true, date, generated: true });
}
