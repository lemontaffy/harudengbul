"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PetEffects, { type ActiveEffect, type EffectType } from "./PetEffects";
import PetEditSheet from "./PetEditSheet";
import type { PetVM, RoomVM, RelationVM, PetRef } from "./types";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function RoomView({
  room,
  pets: initialPets,
  relations,
  wasSleeping,
  rooms,
  allPets,
}: {
  room: RoomVM;
  pets: PetVM[];
  relations: RelationVM[];
  wasSleeping: boolean;
  rooms: PetRef[];
  allPets: PetRef[];
}) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const [pets, setPets] = useState<PetVM[]>(initialPets);
  // 서버 새로고침(router.refresh: 스프라이트 업로드/방 이동 후) 시 새 데이터로 동기화.
  // 로컬 드래그(setPets)는 initialPets 참조를 안 바꾸므로 이 effect를 트리거하지 않는다.
  useEffect(() => {
    setPets(initialPets);
  }, [initialPets]);
  const [asleep, setAsleep] = useState(wasSleeping);
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, string>>({});
  const [loveUntil, setLoveUntil] = useState<Record<number, number>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const effectSeq = useRef(0);

  // 한 펫이 다른 펫과 '연인' 관계이고 둘 다 이 방에 있으면 그 상대 id.
  function lovePartnerInRoom(petId: number): number | null {
    const here = new Set(pets.map((p) => p.id));
    for (const r of relations) {
      if (!r.isLove) continue;
      if (r.petAId === petId && here.has(r.petBId)) return r.petBId;
      if (r.petBId === petId && here.has(r.petAId)) return r.petAId;
    }
    return null;
  }

  function spawnEffect(type: EffectType, xPct: number, yPct: number) {
    if (prefersReducedMotion()) return;
    const id = ++effectSeq.current;
    setEffects((xs) => [...xs, { id, type, xPct, yPct }].slice(-2)); // 동시 2개 제한
    setTimeout(() => setEffects((xs) => xs.filter((e) => e.id !== id)), 1400);
  }

  function showBubble(petId: number, text: string, ms = 2600) {
    setBubbles((b) => ({ ...b, [petId]: text }));
    setTimeout(() => setBubbles((b) => (b[petId] === text ? { ...b, [petId]: "" } : b)), ms);
  }

  // 마운트 1회: 진입 ack + 잠 환영 + 진화 연출.
  useEffect(() => {
    fetch(`/api/pet-rooms/${room.id}/seen`, { method: "POST" }).catch(() => {});
    if (wasSleeping && pets[0]) {
      const p = pets[0];
      showBubble(p.id, "돌아왔구나, 보고 싶었어!");
      spawnEffect("hearts", p.posX, p.posY - 8);
      setTimeout(() => setAsleep(false), 2500);
    }
    for (const p of pets) {
      if (p.evolutionPending) {
        spawnEffect("sparkle", p.posX, p.posY - 8);
        showBubble(p.id, "나… 좀 컸지?");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 탭/드래그 ──
  function pickLine(p: PetVM): string {
    const here = new Set(pets.map((x) => x.id));
    const weighted: string[] = [...p.soloLines];
    for (const a of p.aboutLines) if (here.has(a.aboutPetId)) weighted.push(a.content, a.content); // 같은 방 상대 가중
    if (weighted.length === 0) return ["…", "뀨?", "흐음"][Math.floor(pets.length) % 3] || "…";
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  function onTap(p: PetVM) {
    if (asleep) {
      setAsleep(false);
      return;
    }
    const partner = lovePartnerInRoom(p.id);
    if (partner) {
      // 연인 about_other 우선 + love 슬롯 2초 + hearts
      const about = p.aboutLines.find((a) => a.aboutPetId === partner);
      showBubble(p.id, about?.content ?? "보고 있으면 좋네…");
      spawnEffect("hearts", p.posX, p.posY - 8);
      if (p.lovePath) {
        setLoveUntil((m) => ({ ...m, [p.id]: Date.now() + 2000 }));
        setTimeout(() => setLoveUntil((m) => ({ ...m, [p.id]: 0 })), 2000);
      }
    } else {
      showBubble(p.id, pickLine(p));
      spawnEffect(Math.random() < 0.5 ? "sparkle" : "notes", p.posX, p.posY - 8);
    }
  }

  function startDrag(e: React.PointerEvent, p: PetVM) {
    e.preventDefault();
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let moved = false;
    const start = { x: e.clientX, y: e.clientY };

    function toPct(cx: number, cy: number) {
      return {
        x: Math.max(2, Math.min(98, ((cx - rect.left) / rect.width) * 100)),
        y: Math.max(6, Math.min(96, ((cy - rect.top) / rect.height) * 100)),
      };
    }
    function move(ev: PointerEvent) {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 6) moved = true;
      const { x, y } = toPct(ev.clientX, ev.clientY);
      setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: x, posY: y } : q)));
    }
    function up(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        onTap(pets.find((q) => q.id === p.id) ?? p);
        return;
      }
      const { x, y } = toPct(ev.clientX, ev.clientY);
      fetch(`/api/pets/${p.id}/position`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posX: x, posY: y }),
      }).catch(() => {});
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function uploadBg(file: File) {
    const fd = new FormData();
    fd.append("background", file);
    const res = await fetch(`/api/pet-rooms/${room.id}/background`, { method: "POST", body: fd });
    if (res.ok) router.refresh();
  }

  const pixel = (on: boolean) => (on ? ({ imageRendering: "pixelated" } as const) : {});

  return (
    <div className="flex flex-col gap-3">
      {/* 무대 */}
      <div
        ref={stageRef}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-card bg-surface-2 ring-1 ring-border"
      >
        {room.backgroundPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.backgroundPath}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={pixel(room.pixelRenderBg)}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-surface" />
        )}

        {pets.map((p) => {
          const loving = (loveUntil[p.id] ?? 0) > Date.now();
          const src = asleep ? p.sleepPath ?? p.spritePath : loving ? p.lovePath ?? p.spritePath : p.spritePath;
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none"
              style={{ left: `${p.posX}%`, top: `${p.posY}%` }}
              onPointerDown={(e) => startDrag(e, p)}
            >
              {bubbles[p.id] && (
                <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-control bg-bg/90 px-2 py-1 text-[11px] ring-1 ring-border">
                  {bubbles[p.id]}
                </div>
              )}
              <div className={`relative ${asleep ? "opacity-60" : ""}`}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={p.name}
                    className="h-20 w-20 object-contain"
                    style={pixel(p.pixelRender)}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-3xl">
                    🐾
                  </div>
                )}
                {asleep && <span className="absolute -top-1 right-0 text-sm">💤</span>}
              </div>
              <div className="mt-0.5 text-center text-[10px] opacity-70">{p.name}</div>
            </div>
          );
        })}

        <PetEffects effects={effects} />
      </div>

      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="cursor-pointer rounded-control bg-surface px-3 py-1.5 ring-1 ring-border">
          배경 교체
          <input
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadBg(e.target.files[0])}
          />
        </label>
        <span className="opacity-40">펫을 끌어 배치 · 탭하면 반응</span>
      </div>

      {/* 펫 목록(편집 진입) */}
      <div className="flex flex-wrap gap-2">
        {pets.map((p) => (
          <button
            key={p.id}
            onClick={() => setEditId(p.id)}
            className="rounded-control bg-surface px-3 py-1.5 text-xs ring-1 ring-border hover:ring-accent"
          >
            {p.name} · {p.stage}
          </button>
        ))}
      </div>

      {editId != null && (
        <PetEditSheet
          petId={editId}
          rooms={rooms}
          allPets={allPets}
          onClose={() => setEditId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
