"use client";

import { useState } from "react";
import MomentPlayer from "./MomentPlayer";
import type { MomentLine } from "@/db/schema";

export interface MomentItem {
  id: number;
  petAId: number | null;
  petBId: number | null;
  petAName: string;
  petBName: string;
  relationKind: "hostile" | "love";
  script: MomentLine[];
  createdAt: string;
}

// 순간 기록 보관함 — 카드 탭 시 같은 연출(디밍+말풍선/자막)로 재생. 저장본(재생성 X). 뱃지 없음.
export default function MomentsView({ moments }: { moments: MomentItem[] }) {
  const [playing, setPlaying] = useState<MomentItem | null>(null);

  if (moments.length === 0) {
    return (
      <p className="rounded-card bg-surface p-6 text-center text-sm text-text-dim">
        아직 기록이 없어요. 방에서 관계 있는 두 펫의 ‘순간’을 보면 여기 쌓여요.
      </p>
    );
  }

  // 보관함 재생은 방이 없으니 합성 위치(좌·우)에 펫 배치 → 같은 말풍선/자막 연출.
  const synthPos = (m: MomentItem) =>
    new Map<number, { x: number; y: number; name: string }>(
      [
        m.petAId != null ? ([m.petAId, { x: 32, y: 52, name: m.petAName }] as const) : null,
        m.petBId != null ? ([m.petBId, { x: 68, y: 52, name: m.petBName }] as const) : null,
      ].filter(Boolean) as [number, { x: number; y: number; name: string }][],
    );

  return (
    <>
      <ul className="flex flex-col gap-2">
        {moments.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => setPlaying(m)}
              className="flex w-full items-center gap-3 rounded-card bg-surface p-3 text-left ring-1 ring-border hover:ring-accent"
            >
              <span className="text-xl">{m.relationKind === "love" ? "💞" : "⚡"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.petAName} {m.relationKind === "love" ? "♥" : "✕"} {m.petBName}
                </span>
                <span className="text-[11px] text-text-dim">
                  {new Date(m.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} · {m.script.length}줄
                </span>
              </span>
              <span className="text-lg opacity-30">▶</span>
            </button>
          </li>
        ))}
      </ul>

      {/* 재생 — 어두운 무대에 합성 위치로 같은 연출. */}
      {playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={() => setPlaying(null)}>
          <div
            className="relative aspect-[3/4] w-full max-w-md overflow-hidden rounded-card bg-surface-2 ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 펫 자리 표식(이름) — 디밍 위에 말풍선이 뜬다. */}
            {[
              playing.petAId != null ? { x: 32, name: playing.petAName } : null,
              playing.petBId != null ? { x: 68, name: playing.petBName } : null,
            ]
              .filter(Boolean)
              .map((p, k) => (
                <div key={k} className="absolute -translate-x-1/2 text-3xl" style={{ left: `${p!.x}%`, top: "52%" }}>
                  {playing.relationKind === "love" ? "🐾" : "🐾"}
                </div>
              ))}
            <MomentPlayer
              script={playing.script}
              relationKind={playing.relationKind}
              petPos={synthPos(playing)}
              onDone={() => setPlaying(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
