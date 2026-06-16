import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as momentsRepo from "@/db/repo/petMoments";
import MomentsView, { type MomentItem } from "@/components/pets/MomentsView";

export const dynamic = "force-dynamic";

// 순간 기록 보관함 — 관계 이벤트 씬 저장본. 같은 연출로 재생. 뱃지·안읽음 없음(단순 보관).
export default async function MomentsPage() {
  const user = await requireUser();
  // 비핵심 보관함 — pet_moments 마이그(0051) 미적용 등으로 실패해도 빈 목록으로 안전하게 로드.
  let rows: Awaited<ReturnType<typeof momentsRepo.listForUser>> = [];
  try {
    rows = await momentsRepo.listForUser(user.id, 80);
  } catch (e) {
    console.error("[moments] list skipped:", (e as Error)?.message);
  }
  const moments: MomentItem[] = rows.map((m) => ({
    id: m.id,
    petAId: m.petAId,
    petBId: m.petBId,
    petAName: m.petAName,
    petBName: m.petBName,
    relationKind: m.relationKind as "hostile" | "love",
    script: m.script,
    createdAt: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)).toISOString(),
  }));

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
