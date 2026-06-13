"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PetEffects, { type ActiveEffect, type EffectType } from "./PetEffects";
import PetEditSheet from "./PetEditSheet";
import { walkDurationMs, shouldFlip, pairKey, freqWeight } from "@/lib/petroom";
import type { PetVM, RoomVM, RelationVM, PetRef } from "./types";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const PINGPONG_COOLDOWN_MS = 90_000;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const [pets, setPets] = useState<PetVM[]>(initialPets);
  useEffect(() => setPets(initialPets), [initialPets]);
  const [asleep, setAsleep] = useState(wasSleeping);
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  const [bubble, setBubble] = useState<{ petId: number; text: string } | null>(null);
  const [loveUntil, setLoveUntil] = useState<Record<number, number>>({});
  const [walking, setWalking] = useState<{ petId: number; ms: number; flip: boolean } | null>(null);
  const [customPlay, setCustomPlay] = useState<{ petId: number; path: string; flip: boolean } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const effectSeq = useRef(0);

  const N = Math.max(room.panels.length, 1); // 좌표계 패널 수(스트립 폭 = N*100%)

  // ── 루프용 refs(타이머에서 최신값 읽기) ──
  const petsRef = useRef(pets);
  petsRef.current = pets;
  const asleepRef = useRef(asleep);
  asleepRef.current = asleep;
  const bubbleRef = useRef(bubble);
  bubbleRef.current = bubble;
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  const customRef = useRef(customPlay);
  customRef.current = customPlay;
  const seqRef = useRef(0); // 핑퐁 등 비동기 시퀀스 진행중 표시
  const cooldowns = useRef<Map<string, number>>(new Map());
  const view = useRef({ left: 0, right: 100 });

  function busy(): boolean {
    return !!bubbleRef.current || !!walkingRef.current || !!customRef.current || seqRef.current > 0;
  }
  function isVisible(posX: number): boolean {
    return posX >= view.current.left - 2 && posX <= view.current.right + 2;
  }
  function updateView() {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const w = inner.clientWidth || 1;
    view.current = { left: (el.scrollLeft / w) * 100, right: ((el.scrollLeft + el.clientWidth) / w) * 100 };
  }

  function spawnEffect(type: EffectType, xPct: number, yPct: number) {
    if (reduced()) return;
    const id = ++effectSeq.current;
    setEffects((xs) => [...xs, { id, type, xPct, yPct }].slice(-2));
    setTimeout(() => setEffects((xs) => xs.filter((e) => e.id !== id)), 1400);
  }
  // 단일 말풍선(직렬화). 보이지 않는 펫은 생략(스펙).
  function showBubble(petId: number, text: string, ms = 3200, force = false) {
    const p = petsRef.current.find((x) => x.id === petId);
    if (!force && p && !isVisible(p.posX)) return;
    setBubble({ petId, text });
    setTimeout(() => setBubble((b) => (b && b.petId === petId && b.text === text ? null : b)), ms);
  }

  function isLovePair(a: number, b: number): boolean {
    return relations.some(
      (r) => r.isLove && ((r.petAId === a && r.petBId === b) || (r.petAId === b && r.petBId === a)),
    );
  }
  function aboutLineFor(p: PetVM, otherId: number): string | null {
    const opts = p.aboutLines.filter((a) => a.aboutPetId === otherId);
    return opts.length ? opts[Math.floor(Math.random() * opts.length)].content : null;
  }
  // 탭/자발 발화 공용 — 풀(solo + 같은 방 상대 about ×2)에서 랜덤 1개(kind 포함).
  function pickLine(p: PetVM): { content: string; kind: "solo" | "about_other"; aboutPetId: number | null } {
    const here = new Set(petsRef.current.map((x) => x.id));
    const pool: { content: string; kind: "solo" | "about_other"; aboutPetId: number | null }[] =
      p.soloLines.map((content) => ({ content, kind: "solo", aboutPetId: null }));
    for (const a of p.aboutLines) {
      if (here.has(a.aboutPetId)) {
        const item = { content: a.content, kind: "about_other" as const, aboutPetId: a.aboutPetId };
        pool.push(item, item);
      }
    }
    if (pool.length === 0) {
      const fb = ["…", "뀨?", "흐음"];
      return { content: fb[Math.floor(Math.random() * fb.length)], kind: "solo", aboutPetId: null };
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function loveBurst(petId: number, posX: number, posY: number) {
    if (reduced()) return;
    spawnEffect("hearts", posX, posY - 8);
    const p = petsRef.current.find((x) => x.id === petId);
    if (p?.lovePath) {
      setLoveUntil((m) => ({ ...m, [petId]: Date.now() + 2000 }));
      setTimeout(() => setLoveUntil((m) => ({ ...m, [petId]: 0 })), 2000);
    }
  }

  // ── 마운트: 진입 ack + 잠 환영 + 진화 ──
  useEffect(() => {
    fetch(`/api/pet-rooms/${room.id}/seen`, { method: "POST" }).catch(() => {});
    updateView();
    if (wasSleeping && pets[0]) {
      const p = pets[0];
      showBubble(p.id, "돌아왔구나, 보고 싶었어!", 3000, true);
      loveBurst(p.id, p.posX, p.posY);
      setTimeout(() => setAsleep(false), 2500);
    }
    for (const p of pets) {
      if (p.evolutionPending) {
        spawnEffect("sparkle", p.posX, p.posY - 8);
        showBubble(p.id, "나… 좀 컸지?", 3000, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 앰비언트 루프 ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(tick, 8000 + Math.random() * 12000); // 8~20s
    };
    const tick = () => {
      if (document.visibilityState === "visible" && !busy()) runTick();
      schedule();
    };
    schedule();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runTick() {
    const ps = petsRef.current;
    if (ps.length === 0) return;

    // 잠든 방: 잠꼬대만(틱당 3%).
    if (asleepRef.current) {
      if (Math.random() < 0.03) {
        const p = ps[Math.floor(Math.random() * ps.length)];
        const line = (p.soloLines[Math.floor(Math.random() * p.soloLines.length)] ?? "그게").slice(0, 12);
        showBubble(p.id, `…${line}, …`, 2600);
      }
      return;
    }

    // 1) 핑퐁(근접 상호 about) — 낮은 확률
    if (tryPingpong(0.2)) return;
    // 2) 산책 — walk 슬롯 보유 펫
    if (!reduced() && Math.random() < 0.15 && tryWalk()) return;
    // 3) 커스텀 모션 — 빈도 가중
    if (!reduced() && Math.random() < 0.12 && tryCustom()) return;
    // 4) 자발 발화 — talkativeness 가중 선정 후 talkativeness/100 확률
    trySpontaneous();
  }

  function eligiblePingpongPairs(boost = false) {
    const ps = petsRef.current;
    const pairs: { a: PetVM; b: PetVM }[] = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (Math.abs(a.posX - b.posX) > 30) continue;
        if (!isVisible(a.posX) || !isVisible(b.posX)) continue;
        if (!aboutLineFor(a, b.id) || !aboutLineFor(b, a.id)) continue;
        const last = cooldowns.current.get(pairKey(a.id, b.id)) ?? 0;
        if (Date.now() - last < PINGPONG_COOLDOWN_MS) continue;
        pairs.push({ a, b });
      }
    }
    void boost;
    return pairs;
  }
  function tryPingpong(prob: number): boolean {
    const pairs = eligiblePingpongPairs();
    if (pairs.length === 0 || Math.random() >= prob) return false;
    doPingpong(pairs[Math.floor(Math.random() * pairs.length)].a, pairs[Math.floor(Math.random() * pairs.length)].b);
    return true;
  }
  function doPingpong(a: PetVM, b: PetVM) {
    cooldowns.current.set(pairKey(a.id, b.id), Date.now());
    seqRef.current++;
    const love = isLovePair(a.id, b.id);
    showBubble(a.id, aboutLineFor(a, b.id) ?? "…", 1700);
    if (love) loveBurst(a.id, a.posX, a.posY);
    setTimeout(() => {
      showBubble(b.id, aboutLineFor(b, a.id) ?? "…", 2200);
      if (love) loveBurst(b.id, b.posX, b.posY);
      setTimeout(() => {
        seqRef.current = Math.max(0, seqRef.current - 1);
      }, 2300);
    }, 1700);
  }

  function tryWalk(): boolean {
    const cands = petsRef.current.filter((p) => p.walkPath);
    if (cands.length === 0) return false;
    doWalk(cands[Math.floor(Math.random() * cands.length)]);
    return true;
  }
  function doWalk(p: PetVM) {
    const targetX = 3 + Math.random() * 94;
    const targetY = Math.max(6, Math.min(96, p.posY + (Math.random() * 10 - 5)));
    const ms = walkDurationMs(p.posX, targetX, 7);
    const flip = shouldFlip(p.walkFacing, targetX > p.posX);
    setWalking({ petId: p.id, ms, flip });
    setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: targetX, posY: targetY } : q)));
    setTimeout(() => {
      setWalking((w) => (w?.petId === p.id ? null : w));
      // 도착 지점이 다른 펫 근처면 대화 가중(산책→조우→대화)
      setTimeout(() => {
        if (!busy()) tryPingpong(0.6);
      }, 200);
    }, ms);
  }

  function tryCustom(): boolean {
    const ps = petsRef.current;
    const playable: { pet: PetVM; path: string; line: string | null; w: number }[] = [];
    for (const p of ps) {
      for (const c of p.customs) {
        const w = freqWeight(c.frequency);
        if (w > 0) playable.push({ pet: p, path: c.path, line: c.line, w });
      }
    }
    if (playable.length === 0) return false;
    const total = playable.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    const chosen = playable.find((x) => (r -= x.w) < 0) ?? playable[0];
    doCustom(chosen.pet, chosen.path, chosen.line);
    return true;
  }
  function doCustom(p: PetVM, path: string, line: string | null) {
    const flip = p.walkFacing === "right"; // idle 기준 좌향이면 동일, 단순화
    setCustomPlay({ petId: p.id, path, flip: false });
    void flip;
    if (line) showBubble(p.id, line, 4500);
    setTimeout(() => setCustomPlay((c) => (c?.petId === p.id ? null : c)), 4000 + Math.random() * 2000);
  }

  function trySpontaneous() {
    const ps = petsRef.current.filter((p) => p.talkativeness > 0);
    if (ps.length === 0) return;
    const total = ps.reduce((s, p) => s + p.talkativeness, 0);
    let r = Math.random() * total;
    const p = ps.find((x) => (r -= x.talkativeness) < 0) ?? ps[0];
    if (Math.random() >= p.talkativeness / 100) return;
    const line = pickLine(p);
    showBubble(p.id, line.content);
    if (line.kind === "about_other" && line.aboutPetId != null && isLovePair(p.id, line.aboutPetId)) {
      loveBurst(p.id, p.posX, p.posY);
    }
  }

  // ── 탭/드래그 ──
  function onTap(p: PetVM) {
    if (asleep) {
      setAsleep(false);
      return;
    }
    // 산책 중이면 그 자리 정지
    if (walkingRef.current?.petId === p.id) setWalking(null);
    const line = pickLine(p);
    showBubble(p.id, line.content, 3200, true);
    const lovely = line.kind === "about_other" && line.aboutPetId != null && isLovePair(p.id, line.aboutPetId);
    if (lovely) loveBurst(p.id, p.posX, p.posY);
    else spawnEffect(Math.random() < 0.5 ? "sparkle" : "notes", p.posX, p.posY - 8);
  }

  function startDrag(e: React.PointerEvent, p: PetVM) {
    e.preventDefault();
    if (walkingRef.current?.petId === p.id) setWalking(null);
    const inner = innerRef.current;
    if (!inner) return;
    let moved = false;
    const start = { x: e.clientX, y: e.clientY };
    const toPct = (cx: number, cy: number) => {
      const rect = inner.getBoundingClientRect();
      return {
        x: Math.max(2, Math.min(98, ((cx - rect.left) / rect.width) * 100)),
        y: Math.max(6, Math.min(96, ((cy - rect.top) / rect.height) * 100)),
      };
    };
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 6) moved = true;
      const { x, y } = toPct(ev.clientX, ev.clientY);
      setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: x, posY: y } : q)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        onTap(petsRef.current.find((q) => q.id === p.id) ?? p);
        return;
      }
      const { x, y } = toPct(ev.clientX, ev.clientY);
      fetch(`/api/pets/${p.id}/position`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posX: x, posY: y }),
      }).catch(() => {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── 패널 관리 ──
  async function addPanel(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/pet-rooms/${room.id}/backgrounds`, { method: "POST", body: fd });
    if (res.ok) router.refresh();
    else alertErr(res);
  }
  async function delPanel(bgId: number) {
    const res = await fetch(`/api/pet-rooms/${room.id}/backgrounds/${bgId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }
  async function movePanel(idx: number, dir: -1 | 1) {
    const ids = room.panels.map((b) => b.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    const res = await fetch(`/api/pet-rooms/${room.id}/backgrounds/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: ids }),
    });
    if (res.ok) router.refresh();
  }
  async function alertErr(res: Response) {
    const j = await res.json().catch(() => ({}));
    setStatus(j.error ?? "실패");
  }
  const [status, setStatus] = useState("");

  const pixel = (on: boolean) => (on ? ({ imageRendering: "pixelated" } as const) : {});

  return (
    <div className="flex flex-col gap-3">
      {/* 무대(스트립) */}
      <div
        ref={scrollRef}
        onScroll={updateView}
        className="aspect-[3/4] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-card bg-surface-2 ring-1 ring-border"
      >
        <div ref={innerRef} className="relative h-full" style={{ width: `${N * 100}%` }}>
          {room.panels.length === 0 ? (
            <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-surface" />
          ) : (
            room.panels.map((panel, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={panel.id}
                src={panel.path}
                alt=""
                draggable={false}
                className="absolute top-0 h-full snap-start object-cover"
                style={{ left: `${(i * 100) / N}%`, width: `${100 / N}%`, ...pixel(panel.pixelRender) }}
              />
            ))
          )}

          {pets.map((p) => {
            const loving = (loveUntil[p.id] ?? 0) > Date.now();
            const isWalking = walking?.petId === p.id;
            const custom = customPlay?.petId === p.id ? customPlay : null;
            const src = asleep
              ? p.sleepPath ?? p.spritePath
              : custom
                ? custom.path
                : isWalking
                  ? p.walkPath ?? p.spritePath
                  : loving
                    ? p.lovePath ?? p.spritePath
                    : p.spritePath;
            const flip = isWalking ? walking!.flip : false;
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none"
                style={{
                  left: `${p.posX}%`,
                  top: `${p.posY}%`,
                  transition: isWalking ? `left ${walking!.ms}ms linear, top ${walking!.ms}ms linear` : undefined,
                }}
                onPointerDown={(e) => startDrag(e, p)}
              >
                {bubble?.petId === p.id && (
                  <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-control bg-bg/90 px-2 py-1 text-[11px] ring-1 ring-border">
                    {bubble.text}
                  </div>
                )}
                <div className={`relative ${asleep ? "opacity-60" : ""}`}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={p.name}
                      draggable={false}
                      className="h-20 w-20 object-contain"
                      style={{ ...pixel(p.pixelRender), transform: flip ? "scaleX(-1)" : undefined }}
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-3xl">🐾</div>
                  )}
                  {asleep && <span className="absolute -top-1 right-0 text-sm">💤</span>}
                </div>
                <div className="mt-0.5 text-center text-[10px] opacity-70">{p.name}</div>
              </div>
            );
          })}

          <PetEffects effects={effects} />
        </div>
      </div>

      {/* 패널 관리 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="cursor-pointer rounded-control bg-surface px-3 py-1.5 ring-1 ring-border">
          ＋ 패널
          <input
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && addPanel(e.target.files[0])}
          />
        </label>
        {room.panels.map((b, i) => (
          <span key={b.id} className="flex items-center gap-1 rounded-control bg-bg px-1.5 py-1 ring-1 ring-border">
            <span className="opacity-50">{i + 1}</span>
            <button onClick={() => movePanel(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-20">‹</button>
            <button onClick={() => movePanel(i, 1)} disabled={i === room.panels.length - 1} className="px-1 disabled:opacity-20">›</button>
            <button onClick={() => delPanel(b.id)} className="px-1 opacity-50 hover:text-red-400">×</button>
          </span>
        ))}
        {status && <span className="text-accent">{status}</span>}
      </div>
      <span className="text-[11px] opacity-40">{N > 1 ? "옆으로 스와이프 · " : ""}펫을 끌어 배치 · 탭하면 반응</span>

      {/* 펫 편집 진입 */}
      <div className="flex flex-wrap gap-2">
        {pets.map((p) => (
          <button
            key={p.id}
            onClick={() => setEditId(p.id)}
            className="rounded-control bg-surface px-3 py-1.5 text-xs ring-1 ring-border hover:ring-accent"
          >
            {p.name} · {p.displayStage}
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
