"use client";

import { useState } from "react";
import MomentPlayer, { type SpriteInfo } from "./MomentPlayer";
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
  sceneBg: string | null;
  cast: { id: number; name: string; sprite: string | null; pixel: boolean }[];
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

      {/* 재생 — 자족형 시네마틱 플레이어(장면 배경 + idle 스프라이트 좌·우). */}
      {playing && (
        <MomentPlayer
          script={playing.script}
          relationKind={playing.relationKind}
          sceneBg={playing.sceneBg}
          spriteOf={
            new Map<number, SpriteInfo>(
              playing.cast.map((c) => [c.id, { name: c.name, sprite: c.sprite, pixel: c.pixel }]),
            )
          }
          onDone={() => setPlaying(null)}
        />
      )}
    </>
  );
}
