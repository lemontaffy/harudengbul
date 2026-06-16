"use client";

import { useEffect, useMemo, useState } from "react";
import type { MomentLine } from "@/db/schema";

const CHIP_BG = "rgba(20,18,28,0.92)";
const TEXT_OUTLINE = "0 1px 2px rgba(0,0,0,0.9)";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// 톤별 장면 배경(전용 무대 — 실제 방과 별개). 변형 몇 개 중 결정적으로 하나.
const SCENE_BG: Record<"hostile" | "love", string[]> = {
  hostile: [
    "radial-gradient(120% 90% at 50% 18%, #3a1626 0%, #1a0a14 55%, #0a0610 100%)",
    "linear-gradient(165deg, #2a1020 0%, #1e1230 45%, #0c0712 100%)",
    "radial-gradient(120% 100% at 30% 20%, #402030 0%, #160a12 60%, #08060c 100%)",
  ],
  love: [
    "radial-gradient(120% 90% at 50% 16%, #5a2f46 0%, #2c1622 55%, #160b12 100%)",
    "linear-gradient(165deg, #4a2238 0%, #6a3a52 40%, #2a1622 100%)",
    "radial-gradient(120% 100% at 50% 22%, #6a4458 0%, #311a26 60%, #160b12 100%)",
  ],
};

export type SpriteInfo = { name: string; sprite: string | null; pixel?: boolean };

// 관계 이벤트 '장면' 시네마틱 재생 — 전용 무대(장면 배경 + 펫 idle 스프라이트 좌·우 + 말풍선/자막 번갈아).
//   탭으로 다음(자기 속도). 말하는 펫만 또렷, 나레이터는 하단 레터박스 자막.
export default function MomentPlayer({
  script,
  relationKind,
  spriteOf,
  sceneBg = null,
  onDone,
}: {
  script: MomentLine[];
  relationKind: "hostile" | "love";
  spriteOf: Map<number, SpriteInfo>; // petId → 현재 idle 스프라이트·이름
  sceneBg?: string | null; // 사용자 장면 배경 PNG(있으면 우선, 없으면 톤 그라데이션)
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const line = script[i];
  const isLast = i >= script.length - 1;

  // 등장 펫 — 스크립트의 pet 라인에서 등장 순서대로(최대 2). 첫째 좌, 둘째 우.
  const cast = useMemo(() => {
    const ids: number[] = [];
    for (const l of script) if (l.type === "pet" && l.petId != null && !ids.includes(l.petId)) ids.push(l.petId);
    return ids.slice(0, 2).map((id, idx) => ({ id, x: idx === 0 ? 30 : 70, info: spriteOf.get(id) }));
  }, [script, spriteOf]);

  // 배경 — 사용자 PNG 있으면 우선(cover), 없으면 톤 그라데이션(결정적).
  const bgStyle = useMemo(() => {
    if (sceneBg) return { backgroundImage: `url("${sceneBg}")`, backgroundSize: "cover", backgroundPosition: "center" };
    const pool = SCENE_BG[relationKind];
    return { background: pool[script.length % pool.length] };
  }, [sceneBg, relationKind, script.length]);

  const [heart, setHeart] = useState(relationKind === "love" && !reduced());
  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(false), 1500);
    return () => clearTimeout(t);
  }, [heart]);

  function next() {
    if (isLast) onDone();
    else setI((v) => v + 1);
  }
  if (!line) return null;

  const speakingId = line.type === "pet" ? line.petId ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={next}>
      <div className="relative aspect-[3/4] w-full max-w-md cursor-pointer overflow-hidden rounded-card ring-1 ring-white/10" style={bgStyle}>
        {/* 시네마틱 레터박스 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-black/55" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-black/55" />

        {/* 진행 점 */}
        <div className="pointer-events-none absolute right-2 top-2.5 z-10 flex items-center gap-1">
          {script.map((_, k) => (
            <span key={k} className={`h-1 w-1 rounded-full ${k <= i ? "bg-white/85" : "bg-white/25"}`} />
          ))}
        </div>

        {/* 펫 idle 스프라이트 — 무대 바닥선에 좌·우로. 말하는 펫만 또렷. */}
        {cast.map((c) => {
          const dim = speakingId != null && speakingId !== c.id;
          return (
            <div key={c.id} className="absolute -translate-x-1/2" style={{ left: `${c.x}%`, top: "60%", transition: reduced() ? undefined : "opacity 220ms, filter 220ms", opacity: dim ? 0.45 : 1, filter: dim ? "brightness(0.6)" : "none" }}>
              {c.info?.sprite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.info.sprite} alt={c.info.name} className="h-24 w-24 object-contain" style={{ imageRendering: c.info.pixel === false ? "auto" : "pixelated", objectPosition: "bottom" }} />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center text-5xl">🐾</div>
              )}
              <div className="mt-0.5 text-center text-[10px] text-white/70" style={{ textShadow: TEXT_OUTLINE }}>{c.info?.name ?? ""}</div>
            </div>
          );
        })}

        {/* 펫 대사 = 그 펫 머리 위 말풍선 */}
        {line.type === "pet" && line.petId != null && (() => {
          const c = cast.find((x) => x.id === line.petId);
          if (!c) return null;
          return (
            <div className="absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: `${c.x}%`, top: "57%" }}>
              <div className="relative w-max whitespace-pre-wrap rounded-md border border-white/30 px-2.5 py-1.5 text-center text-[12px] font-medium text-white" style={{ background: CHIP_BG, textShadow: TEXT_OUTLINE, maxWidth: 200, overflowWrap: "anywhere" }}>
                {line.text}
                <span className="absolute left-1/2 top-full -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${CHIP_BG}` }} />
              </div>
            </div>
          );
        })()}

        {/* 나레이터 = 상단 자막(레터박스 아래) */}
        {line.type === "narrator" && (
          <div className="absolute inset-x-0 top-8 z-10 px-5 pt-3">
            <p className="text-center text-[13px] italic leading-snug text-white/95" style={{ textShadow: TEXT_OUTLINE }}>{line.text}</p>
          </div>
        )}

        {heart && (
          <div className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 text-4xl" style={{ animation: "petPop 1.4s ease-out forwards" }}>❤️</div>
        )}

        <span className="pointer-events-none absolute bottom-1.5 right-2 z-10 text-[10px] text-white/55">{isLast ? "탭하면 끝" : "탭하면 다음 ›"}</span>
      </div>
    </div>
  );
}
