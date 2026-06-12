import Link from "next/link";

export interface PetMiniItem {
  name: string;
  avatar: string | null;
  asleep: boolean;
}

// 홈 미니 위젯 — 마지막으로 본 방의 펫. 자는 애는 어둡게. 펫 0마리면 호출부에서 미렌더.
export default function PetMiniWidget({ roomId, items }: { roomId: number; items: PetMiniItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-card bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">펫</h2>
        <Link href="/pets" className="text-[11px] text-accent">전체 보기</Link>
      </div>
      <Link href={`/pets/${roomId}`} className="flex flex-wrap items-center gap-3">
        {items.slice(0, 6).map((p, i) => (
          <div key={i} className={`flex flex-col items-center gap-0.5 ${p.asleep ? "opacity-50" : ""}`}>
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt={p.name} className="h-12 w-12 rounded-full bg-bg object-contain" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg text-xl">🐾</span>
            )}
            <span className="text-[10px] opacity-70">
              {p.name}
              {p.asleep ? " 💤" : ""}
            </span>
          </div>
        ))}
      </Link>
    </section>
  );
}
