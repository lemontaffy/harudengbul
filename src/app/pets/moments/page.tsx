import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as momentsRepo from "@/db/repo/petMoments";
import * as petsRepo from "@/db/repo/pets";
import * as spritesRepo from "@/db/repo/petSprites";
import { stageFor, reachedStages, displayStageFor, pickSpritePath } from "@/lib/pets";
import { pickSceneBg } from "@/lib/petMoment";
import MomentsView, { type MomentItem } from "@/components/pets/MomentsView";

export const dynamic = "force-dynamic";

// 순간 기록 보관함 — 관계 이벤트 씬 저장본. 같은 시네마틱 연출(장면 배경 + idle 스프라이트)로 재생.
export default async function MomentsPage() {
  const user = await requireUser();
  let rows: Awaited<ReturnType<typeof momentsRepo.listForUser>> = [];
  try {
    rows = await momentsRepo.listForUser(user.id, 80);
  } catch (e) {
    console.error("[moments] list skipped:", (e as Error)?.message);
  }

  // 펫 현재 idle 스프라이트 맵(재생 무대용). 떠난 펫은 스프라이트 없음(이름 스냅샷·이모지 폴백).
  const [allPets, allSprites] = await Promise.all([petsRepo.listByUser(user.id), spritesRepo.listForUser(user.id)]);
  const spriteFor = (petId: number | null): { sprite: string | null; pixel: boolean } => {
    const p = petId != null ? allPets.find((x) => x.id === petId) : undefined;
    if (!p) return { sprite: null, pixel: true };
    const display = displayStageFor(
      stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold),
      p.displayStage,
      reachedStages(p.growthPoints, p.teenThreshold, p.adultThreshold),
    );
    return { sprite: pickSpritePath(allSprites.filter((s) => s.petId === p.id), display, "idle"), pixel: p.pixelRender };
  };

  const moments: MomentItem[] = await Promise.all(
    rows.map(async (m) => {
      const a = spriteFor(m.petAId);
      const b = spriteFor(m.petBId);
      return {
        id: m.id,
        petAId: m.petAId,
        petBId: m.petBId,
        petAName: m.petAName,
        petBName: m.petBName,
        relationKind: m.relationKind as "hostile" | "love",
        script: m.script,
        createdAt: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
        sceneBg: await pickSceneBg(user.id, m.relationKind as "hostile" | "love"),
        cast: [
          m.petAId != null ? { id: m.petAId, name: m.petAName, sprite: a.sprite, pixel: a.pixel } : null,
          m.petBId != null ? { id: m.petBId, name: m.petBName, sprite: b.sprite, pixel: b.pixel } : null,
        ].filter(Boolean) as MomentItem["cast"],
      };
    }),
  );

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/pets" className="text-sm opacity-60 hover:opacity-100">
          ← 펫 룸
        </Link>
        <h1 className="font-display text-base font-semibold">순간 기록</h1>
        <span className="w-12" />
      </div>
      <MomentsView moments={moments} />
    </main>
  );
}
