"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DiaryEntry {
  petName: string;
  avatar: string | null;
  content: string;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${y}년 ${m}월 ${day}일`;
}

// 펼친 노트 비주얼 — 줄지은 종이 + 손글씨풍. 페이지(펫)별로 넘겨본다.
const PAPER =
  "repeating-linear-gradient(transparent, transparent 27px, rgba(0,0,0,0.06) 28px)";

export default function PetDiaryView({
  date,
  today,
  isToday,
  entries,
  dates,
  hasPets,
}: {
  date: string;
  today: string;
  isToday: boolean;
  entries: DiaryEntry[];
  dates: string[];
  hasPets: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [peeking, setPeeking] = useState(false);

  async function peek() {
    setPeeking(true);
    try {
      await fetch("/api/pet-diary/generate", { method: "POST" });
      router.refresh();
    } finally {
      setPeeking(false);
    }
  }

  // 오늘인데 아직 안 들여다봤으면 — 훔쳐보기 연출.
  if (isToday && entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="text-5xl">📔</div>
        <p className="text-sm opacity-60">
          펫들이 안 볼 때 적어둔 일기가 있는 것 같다…
          <br />
          살짝 들여다볼까?
        </p>
        <button
          onClick={peek}
          disabled={peeking || !hasPets}
          className="rounded-control bg-accent px-5 py-2.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {peeking ? "살펴보는 중…" : "살짝 들여다본다"}
        </button>
        {!hasPets && <p className="text-[11px] opacity-40">아직 펫이 없어요.</p>}
        {dates.length > 0 && <DateNav date={date} dates={dates} />}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm opacity-40">이 날의 펫 일기는 없어요.</p>
        <DateNav date={date} dates={dates} today={today} />
      </div>
    );
  }

  const e = entries[Math.min(page, entries.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <DateNav date={date} dates={dates} today={today} />

      {/* 펼친 일기장 */}
      <div className="rounded-card bg-[#f3ead6] p-4 text-[#3a3326] shadow-inner ring-1 ring-black/10">
        <div className="mb-3 flex items-center gap-3 border-b border-black/10 pb-3">
          {e.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.avatar} alt="" className="h-12 w-12 rounded-full bg-black/5 object-contain" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-xl">🐾</span>
          )}
          <div style={{ fontFamily: "var(--font-pixel)" }}>
            <div className="text-sm font-semibold">{e.petName}의 일기</div>
            <div className="text-[11px] opacity-50">{fmtDate(date)}</div>
          </div>
        </div>
        <p
          className="min-h-[7rem] whitespace-pre-wrap text-[16px] leading-7"
          style={{ background: PAPER, fontFamily: "var(--font-pet-diary)" }}
        >
          {e.content}
        </p>
      </div>

      {/* 페이지(펫) 넘기기 */}
      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border disabled:opacity-30"
        >
          ‹ 이전
        </button>
        <span className="opacity-50">
          {Math.min(page, entries.length - 1) + 1} / {entries.length}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(entries.length - 1, p + 1))}
          disabled={page >= entries.length - 1}
          className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border disabled:opacity-30"
        >
          다음 ›
        </button>
      </div>
    </div>
  );
}

// 날짜 아카이브 — 일기 있는 날짜 사이를 오간다.
function DateNav({ date, dates, today }: { date: string; dates: string[]; today?: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? "/pet-diary" : `/pet-diary?date=${d}`);
  if (dates.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="opacity-50">지난 일기</span>
      <select
        value={dates.includes(date) ? date : ""}
        onChange={(ev) => ev.target.value && go(ev.target.value)}
        className="rounded-control bg-bg px-2 py-1.5 ring-1 ring-border"
      >
        {!dates.includes(date) && <option value="">오늘</option>}
        {dates.map((d) => (
          <option key={d} value={d}>
            {fmtDate(d)}
            {d === today ? " (오늘)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
