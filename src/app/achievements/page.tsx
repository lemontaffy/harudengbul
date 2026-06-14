import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as achievementsRepo from "@/db/repo/achievements";
import Medal, { tierForRank, tierLabel } from "@/components/Medal";

export const dynamic = "force-dynamic";

function fmt(d: Date | string): string {
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default async function AchievementsPage() {
  const user = await requireUser();
  const list = await achievementsRepo.listForUser(user.id);

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← 홈
        </Link>
        <h1 className="font-display text-base font-semibold">업적판</h1>
        <span className="w-8" />
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-sm opacity-40">
          아직 업적이 없어요.
          <br />
          상담하다 해낸 일이 보이면 노라가 여기 남겨줘요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a, i) => {
            // 목록은 최신순(desc). 누적 순번 = 전체수 - 표시인덱스 → 최근일수록 상위 등급.
            const rank = list.length - i;
            const tier = tierForRank(rank);
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-card bg-surface p-3 ring-1 ring-border">
                <Medal tier={tier} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{a.title}</div>
                  <div className="text-[11px] opacity-40">
                    {tierLabel(tier)} · {a.createdAt ? fmt(a.createdAt) : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
