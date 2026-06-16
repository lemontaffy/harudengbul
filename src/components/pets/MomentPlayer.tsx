"use client";

import { useEffect, useState } from "react";
import type { MomentLine } from "@/db/schema";

const CHIP_BG = "rgba(20,18,28,0.92)";
const TEXT_OUTLINE = "0 1px 2px rgba(0,0,0,0.9)";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// 관계 이벤트 연출 — 방을 '디밍'(검정 아님)하고 펫=말풍선 / 나레이터=자막 번갈아. 탭으로 다음(자기 속도).
//   stage(innerRef) 안에 깔려 % 좌표가 펫 위치와 일치. 마지막 줄 후 onDone.
export default function MomentPlayer({
  script,
  petPos,
  relationKind,
  onDone,
}: {
  script: MomentLine[];
  petPos: Map<number, { x: number; y: number; name: string }>;
  relationKind: "hostile" | "love";
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const line = script[i];
  const isLast = i >= script.length - 1;

  // 애정 씬: 시작에 하트 한 번(이펙트 제한·reduced-motion 존중).
  const [heart, setHeart] = useState(relationKind === "love" && !reduced());
  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(false), 1400);
    return () => clearTimeout(t);
  }, [heart]);

  function next() {
    if (isLast) onDone();
    else setI((v) => v + 1);
  }

  if (!line) return null;
  const pos = line.type === "pet" && line.petId != null ? petPos.get(line.petId) : undefined;

  return (
    <div
      className="absolute inset-0 z-30 cursor-pointer"
      onClick={next}
      style={{ transition: reduced() ? undefined : "background 220ms ease", background: "rgba(8,8,14,0.55)" }}
    >
      {/* 진행 점 + 안내 */}
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1">
        {script.map((_, k) => (
          <span key={k} className={`h-1 w-1 rounded-full ${k <= i ? "bg-white/80" : "bg-white/25"}`} />
        ))}
      </div>

      {/* 펫 대사 = 머리 위 말풍선(해당 펫 위치) */}
      {line.type === "pet" && pos && (
        <div className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${pos.x}%`, top: `${pos.y - 6}%` }}>
          <div className="relative whitespace-pre-wrap rounded-md border border-white/30 px-2.5 py-1.5 text-center text-[12px] font-medium text-white" style={{ background: CHIP_BG, textShadow: TEXT_OUTLINE, maxWidth: 180 }}>
            <span className="mb-0.5 block text-[9px] text-white/60">{pos.name}</span>
            {line.text}
            <span className="absolute left-1/2 top-full -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${CHIP_BG}` }} />
          </div>
        </div>
      )}

      {/* 나레이터 = 하단 자막(레터박스 느낌) */}
      {line.type === "narrator" && (
        <div className="absolute inset-x-0 bottom-0">
          <div className="bg-black/80 px-4 py-3 text-center">
            <p className="text-[13px] italic leading-snug text-white/90" style={{ textShadow: TEXT_OUTLINE }}>{line.text}</p>
          </div>
        </div>
      )}

      {heart && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-3xl" style={{ animation: "petPop 1.3s ease-out forwards" }}>
          ❤️
        </div>
      )}

      <span className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-white/50">{isLast ? "탭하면 끝" : "탭하면 다음"}</span>
    </div>
  );
}
