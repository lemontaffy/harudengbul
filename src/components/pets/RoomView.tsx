"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PetEffects, { type ActiveEffect, type EffectType } from "./PetEffects";
import PetEditSheet from "./PetEditSheet";
import {
  walkDurationMs,
  shouldFlip,
  pairKey,
  freqWeight,
  effectiveActiveness,
  wanderRange,
  walkStartProb,
  pingpongProb,
} from "@/lib/petroom";
import { isHostileLabel } from "@/lib/pets";
import type { PetVM, RoomVM, RelationVM, PetRef, FurnitureVM } from "./types";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const PINGPONG_COOLDOWN_MS = 90_000;
const STARTLE_LINES = ["꺄앗!", "으냐?!", "깜짝이야!", "헉!", "으아앙"]; // 자다 깨면 놀라는 한 마디
const PET_RADIUS_PX = 36; // 점유 반경 ≈ 스프라이트(80px) 폭 절반(약간 작게 — 살짝 겹침은 허용)
const SEAT_TARGET_PROB = 0.25; // 산책 시 빈 seat 가구를 목적지로 고를 확률(낮게 가중)
// fixture 액션 → 앱 기능 경로. 없거나 'none'이면 순수 장식.
const FIXTURE_ROUTE: Record<string, string> = { letters: "/letters", memo: "/memos", diary: "/diary" };

// 배경 밝기와 무관하게 텍스트를 분리 — 어두운 칩 + 4방향 검은 외곽선(칩 페이드 중에도 안 묻힘).
const CHIP_BG = "rgba(0,0,0,0.72)";
const TEXT_OUTLINE = "0 0 2px #000, -1px -1px 0 #000, 1px 1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000";

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
  const [napUntil, setNapUntil] = useState<Record<number, number>>({}); // 개별 펫이 잠깐 조는 이벤트(보는 중에도)
  const [startleUntil, setStartleUntil] = useState<Record<number, number>>({}); // 깨우면 짧게 튀는 모션
  const [sitUntil, setSitUntil] = useState<Record<number, number>>({}); // 가구에 앉아 쉬는 중(sit 스프라이트)
  const [furniture, setFurniture] = useState<FurnitureVM[]>(room.furniture);
  useEffect(() => setFurniture(room.furniture), [room.furniture]);
  const [toast, setToast] = useState(""); // 가구 탭 등 짧은 안내
  const [walking, setWalking] = useState<{ petId: number; ms: number; flip: boolean } | null>(null);
  const [customPlay, setCustomPlay] = useState<{ petId: number; path: string; flip: boolean } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [showNames, setShowNames] = useState(true); // 이름표 표시 on/off(끄면 아예 안 뜸)
  const [menu, setMenu] = useState<null | "room" | "pet">(null); // 설정 메뉴(평소 접힘)
  const [liveliness, setLiveliness] = useState(room.liveliness); // 방 분주함(즉시 반영)
  const effectSeq = useRef(0);
  const livelinessRef = useRef(liveliness);
  livelinessRef.current = liveliness;
  const lingerUntil = useRef<Map<number, number>>(new Map()); // 산책 후 머묾(2~8s)

  function changeLiveliness(v: number) {
    setLiveliness(v);
    fetch(`/api/pet-rooms/${room.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liveliness: v }),
    }).catch(() => {});
  }

  useEffect(() => {
    const v = localStorage.getItem("petShowNames");
    if (v != null) setShowNames(v === "1");
  }, []);
  function toggleNames() {
    setShowNames((v) => {
      const n = !v;
      try {
        localStorage.setItem("petShowNames", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  }

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
  const napUntilRef = useRef(napUntil);
  napUntilRef.current = napUntil;
  const sitUntilRef = useRef(sitUntil);
  sitUntilRef.current = sitUntil;
  const furnitureRef = useRef(furniture);
  furnitureRef.current = furniture;
  const seatOfRef = useRef<Map<number, number>>(new Map()); // petId → 점유 중인 seat 가구 id
  const seqRef = useRef(0); // 핑퐁 등 비동기 시퀀스 진행중 표시
  const cooldowns = useRef<Map<string, number>>(new Map());
  const view = useRef({ left: 0, right: 100 });

  function busy(): boolean {
    return !!bubbleRef.current || !!walkingRef.current || !!customRef.current || seqRef.current > 0;
  }
  function isNapping(petId: number, now = Date.now()): boolean {
    return (napUntilRef.current[petId] ?? 0) > now;
  }
  function isSitting(petId: number, now = Date.now()): boolean {
    return (sitUntilRef.current[petId] ?? 0) > now;
  }
  // 빈 seat 가구 하나(없으면 null). 점유는 seatOfRef 로 한 seat 한 펫 보장.
  function pickEmptySeat(): FurnitureVM | null {
    const occupied = new Set(seatOfRef.current.values());
    const seats = furnitureRef.current.filter((f) => f.kind === "seat" && !occupied.has(f.id));
    return seats.length ? seats[Math.floor(Math.random() * seats.length)] : null;
  }

  // ── 펫 겹침(점유 반경) 판정 ── 좌표가 X=스트립%·Y=높이%로 축마다 px 스케일이 달라,
  //    충돌은 픽셀 공간에서 계산해야 정확하다.
  function roomDims(): { W: number; H: number } {
    return { W: innerRef.current?.clientWidth ?? 0, H: scrollRef.current?.clientHeight ?? 0 };
  }
  function overlapsPx(ax: number, ay: number, bx: number, by: number, W: number, H: number): boolean {
    const dx = ((ax - bx) / 100) * W;
    const dy = ((ay - by) / 100) * H;
    return dx * dx + dy * dy < (2 * PET_RADIUS_PX) ** 2; // 두 점유 반경 합보다 가까우면 겹침
  }
  function collidesAny(petId: number, x: number, y: number, W: number, H: number): boolean {
    return petsRef.current.some((o) => o.id !== petId && overlapsPx(x, y, o.posX, o.posY, W, H));
  }
  // 드래그 배치 보정 — 겹치면 놓은 위치 근처 가장 가까운 비충돌 지점으로 살짝 밀기.
  // 못 찾으면(좁은 방 등) 그대로 둠 — 못 놓는 것보다 겹치는 게 낫다(경고 없음).
  function resolvePlacement(petId: number, x: number, y: number): { x: number; y: number } {
    const { W, H } = roomDims();
    if (!W || !H || !collidesAny(petId, x, y, W, H)) return { x, y };
    const cx = (x / 100) * W;
    const cy = (y / 100) * H;
    for (let r = 8; r <= 180; r += 8) {
      for (let a = 0; a < 360; a += 30) {
        const rad = (a * Math.PI) / 180;
        const nx = Math.max(2, Math.min(98, ((cx + Math.cos(rad) * r) / W) * 100));
        const ny = Math.max(6, Math.min(96, ((cy + Math.sin(rad) * r) / H) * 100));
        if (!collidesAny(petId, nx, ny, W, H)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }
  // 산책 목적지 — 비충돌 지점을 최대 8회 재추첨. 다 실패하면 null(이번 틱 이동 취소).
  function pickWalkTarget(p: PetVM, ea: number): { x: number; y: number } | null {
    const { W, H } = roomDims();
    const range = wanderRange(ea);
    for (let i = 0; i < 8; i++) {
      const x = Math.max(3, Math.min(97, p.posX + (Math.random() * 2 - 1) * range));
      const y = Math.max(6, Math.min(96, p.posY + (Math.random() * 10 - 5)));
      if (!W || !H) return { x, y }; // 치수 모름 → 충돌검사 스킵
      if (!collidesAny(p.id, x, y, W, H)) return { x, y };
    }
    return null;
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
  // 적대 관계 페어 — 연인(isLovePair)과 대칭. 라벨 키워드로 판정(빠직 anger 트리거).
  function isHostilePair(a: number, b: number): boolean {
    return relations.some(
      (r) =>
        isHostileLabel(r.label) &&
        ((r.petAId === a && r.petBId === b) || (r.petAId === b && r.petBId === a)),
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

  // ── 앰비언트 루프 ── 틱 간격은 liveliness 에 따라 짧아짐(분주함의 맥박).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const L = livelinessRef.current;
      // L=50→~7s, 100→~4s, 25→~12s, 10→~24s. 자발 발화도 이 틱에 편승.
      const base = 7000 / Math.max(0.3, L / 50);
      const interval = Math.max(3500, Math.min(24000, base)) * (0.7 + Math.random() * 0.6);
      timer = setTimeout(tick, interval);
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
    const L = livelinessRef.current;

    // 잠든 방: 잠꼬대만(틱당 3%).
    if (asleepRef.current) {
      if (Math.random() < 0.03) {
        const p = ps[Math.floor(Math.random() * ps.length)];
        const line = (p.soloLines[Math.floor(Math.random() * p.soloLines.length)] ?? "그게").slice(0, 12);
        showBubble(p.id, `…${line}, …`, 2600);
      }
      return;
    }

    // 개별 졸기 — 분주함과 무관(차분한 방에서도). sleep 슬롯 있는 펫이 가끔.
    if (tryNap()) return;

    // 이동·핑퐁은 liveliness 가 0이면 완전 정지(자발 발화는 talkativeness 로 별개).
    if (L > 0 && !reduced()) {
      if (tryPingpong(false)) return; // 근접 상호 about — 실효 활동성 기반 확률
      if (tryWalk()) return; // 자유 배회(짧은 이동) — 실효 활동성 기반
      if (Math.random() < 0.12 && tryCustom()) return; // 커스텀 모션
    }
    // 자발 발화 — talkativeness 가중(분주함과 무관, 잠 안 든 방).
    trySpontaneous();
  }

  function eligiblePingpongPairs(boost = false) {
    const ps = petsRef.current;
    const pairs: { a: PetVM; b: PetVM }[] = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (isNapping(a.id) || isNapping(b.id)) continue; // 조는 펫은 대화 안 함
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
  function tryPingpong(boost: boolean): boolean {
    const pairs = eligiblePingpongPairs();
    if (pairs.length === 0) return false;
    const L = livelinessRef.current;
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const eaAvg = (effectiveActiveness(pair.a.activeness, L) + effectiveActiveness(pair.b.activeness, L)) / 2;
    if (Math.random() >= pingpongProb(eaAvg, boost)) return false;
    doPingpong(pair.a, pair.b);
    return true;
  }
  function doPingpong(a: PetVM, b: PetVM) {
    cooldowns.current.set(pairKey(a.id, b.id), Date.now());
    seqRef.current++;
    const love = isLovePair(a.id, b.id);
    const hostile = !love && isHostilePair(a.id, b.id);
    showBubble(a.id, aboutLineFor(a, b.id) ?? "…", 1700);
    if (love) loveBurst(a.id, a.posX, a.posY);
    else if (hostile) spawnEffect("anger", a.posX, a.posY - 8);
    setTimeout(() => {
      showBubble(b.id, aboutLineFor(b, a.id) ?? "…", 2200);
      if (love) loveBurst(b.id, b.posX, b.posY);
      else if (hostile) spawnEffect("anger", b.posX, b.posY - 8);
      setTimeout(() => {
        seqRef.current = Math.max(0, seqRef.current - 1);
      }, 2300);
    }, 1700);
  }

  // 자유 배회 — walk 슬롯 보유 & 머묾(linger) 안 끝난 & 앉아있지 않은 펫. 실효 활동성 가중·확률.
  function tryWalk(): boolean {
    const now = Date.now();
    const L = livelinessRef.current;
    const cands = petsRef.current
      .filter(
        (p) =>
          p.walkPath &&
          !isNapping(p.id, now) &&
          !isSitting(p.id, now) &&
          (lingerUntil.current.get(p.id) ?? 0) <= now,
      )
      .map((p) => ({ p, ea: effectiveActiveness(p.activeness, L) }))
      .filter((x) => x.ea > 0);
    if (cands.length === 0) return false;
    const total = cands.reduce((s, x) => s + x.ea, 0);
    let r = Math.random() * total;
    const chosen = cands.find((x) => (r -= x.ea) < 0) ?? cands[0];
    if (Math.random() >= walkStartProb(chosen.ea)) return false; // 정지 우세
    // 가끔 빈 seat 가구로 향함(sit 슬롯 있는 펫만). 아니면 가까운 랜덤 지점.
    if (chosen.p.sitPath && Math.random() < SEAT_TARGET_PROB) {
      const seat = pickEmptySeat();
      if (seat) {
        doWalk(chosen.p, { x: seat.posX, y: seat.posY }, seat.id);
        return true;
      }
    }
    // 다른 펫 점유 반경 피해 재추첨, 다 실패하면 이번 틱 이동 취소.
    const target = pickWalkTarget(chosen.p, chosen.ea);
    if (!target) return false;
    doWalk(chosen.p, target);
    return true;
  }
  function doWalk(p: PetVM, target: { x: number; y: number }, seatId?: number) {
    const ms = walkDurationMs(p.posX, target.x, 7);
    const flip = shouldFlip(p.walkFacing, target.x > p.posX);
    setWalking({ petId: p.id, ms, flip });
    setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: target.x, posY: target.y } : q)));
    setTimeout(() => {
      setWalking((w) => (w?.petId === p.id ? null : w));
      if (seatId != null) {
        // 가구에 앉음 — sit 스프라이트로 전환, 일반 머묾보다 길게 쉼(15~40s). 한 seat 한 펫.
        seatOfRef.current.set(p.id, seatId);
        const dur = 15000 + Math.random() * 25000;
        const until = Date.now() + dur;
        setSitUntil((m) => ({ ...m, [p.id]: until }));
        setTimeout(() => {
          seatOfRef.current.delete(p.id); // 일어나며 seat 비움
          setSitUntil((m) => (m[p.id] === until ? { ...m, [p.id]: 0 } : m));
        }, dur);
        return; // 쉬는 중 — 핑퐁 가중 없음
      }
      // 도착 후 idle 로 머묾(2~8s) — 다음 산책 보류. 정지 우세.
      lingerUntil.current.set(p.id, Date.now() + 2000 + Math.random() * 6000);
      // 도착 지점이 다른 펫 근처면 핑퐁 가중(산책→조우→대화).
      setTimeout(() => {
        if (!busy()) tryPingpong(true);
      }, 200);
    }, ms);
  }

  // 개별 졸기 — 보고 있어도 가끔 한 마리가 잠깐 존다(sleep 슬롯 있을 때만, 의미 있게).
  function tryNap(): boolean {
    const now = Date.now();
    const cands = petsRef.current.filter(
      (p) => p.sleepPath && !isNapping(p.id, now) && !isSitting(p.id, now) && walkingRef.current?.petId !== p.id,
    );
    if (cands.length === 0) return false;
    if (Math.random() >= 0.05) return false; // 가끔만(잠이 길어 발생은 드물게)
    doNap(cands[Math.floor(Math.random() * cands.length)]);
    return true;
  }
  function doNap(p: PetVM) {
    const dur = 3600_000 + Math.random() * 4 * 3600_000; // 1~5시간(탭하면 즉시 깸)
    const until = Date.now() + dur;
    setNapUntil((m) => ({ ...m, [p.id]: until }));
    spawnEffect("zzz", p.posX, p.posY - 8);
    setTimeout(() => {
      setNapUntil((m) => (m[p.id] === until ? { ...m, [p.id]: 0 } : m)); // 탭으로 일찍 깼으면 건드리지 않음
    }, dur + 50);
  }

  function tryCustom(): boolean {
    const ps = petsRef.current;
    const playable: { pet: PetVM; path: string; line: string | null; w: number }[] = [];
    for (const p of ps) {
      if (isNapping(p.id) || isSitting(p.id)) continue; // 조는·앉은 펫은 커스텀 모션 제외
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
    const ps = petsRef.current.filter((p) => p.talkativeness > 0 && !isNapping(p.id));
    if (ps.length === 0) return;
    const total = ps.reduce((s, p) => s + p.talkativeness, 0);
    let r = Math.random() * total;
    const p = ps.find((x) => (r -= x.talkativeness) < 0) ?? ps[0];
    if (Math.random() >= p.talkativeness / 100) return;
    const line = pickLine(p);
    showBubble(p.id, line.content);
    if (line.kind === "about_other" && line.aboutPetId != null) {
      if (isLovePair(p.id, line.aboutPetId)) loveBurst(p.id, p.posX, p.posY);
      else if (isHostilePair(p.id, line.aboutPetId)) spawnEffect("anger", p.posX, p.posY - 8);
    }
  }

  // 자다 깨면 놀라는 리액션(놀람 대사 + 팟 이펙트 + 짧게 튀는 모션). 깨우는 탭에서만.
  // 톤: 귀여운 깜짝, 책망 아님. 대사 풀: wake → solo → 기본 감탄사 순.
  function startleWake(p: PetVM) {
    const pool = p.wakeLines.length ? p.wakeLines : p.soloLines.length ? p.soloLines : STARTLE_LINES;
    showBubble(p.id, pool[Math.floor(Math.random() * pool.length)], 1800, true);
    spawnEffect("startle", p.posX, p.posY - 8);
    if (!reduced()) {
      setStartleUntil((m) => ({ ...m, [p.id]: Date.now() + 480 }));
      setTimeout(() => setStartleUntil((m) => (m[p.id] && m[p.id] <= Date.now() ? { ...m, [p.id]: 0 } : m)), 520);
    }
  }

  // ── 탭/드래그 ──
  function onTap(p: PetVM) {
    // 전역 잠을 만져서 깨움 — 놀라는 리액션.
    if (asleep) {
      setAsleep(false);
      startleWake(p);
      return;
    }
    // 조는 중이면 만지는 즉시 깨우고 놀라는 리액션(일반 발화 대신).
    if (isNapping(p.id)) {
      setNapUntil((m) => ({ ...m, [p.id]: 0 }));
      startleWake(p);
      return;
    }
    // 산책 중이면 그 자리 정지
    if (walkingRef.current?.petId === p.id) setWalking(null);
    const line = pickLine(p);
    showBubble(p.id, line.content, 3200, true);
    const about = line.kind === "about_other" && line.aboutPetId != null ? line.aboutPetId : null;
    const lovely = about != null && isLovePair(p.id, about);
    const hostile = about != null && !lovely && isHostilePair(p.id, about);
    if (lovely) loveBurst(p.id, p.posX, p.posY);
    else if (hostile) spawnEffect("anger", p.posX, p.posY - 8);
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
      const raw = toPct(ev.clientX, ev.clientY);
      // 다른 펫 점유 반경과 겹치면 가장 가까운 비충돌 지점으로 살짝 비켜 배치(못 찾으면 그대로).
      const { x, y } = resolvePlacement(p.id, raw.x, raw.y);
      setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: x, posY: y } : q)));
      fetch(`/api/pets/${p.id}/position`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posX: x, posY: y }),
      }).catch(() => {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── 가구 ──
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1800);
  }
  // fixture 탭 → 연결된 앱 기능 열기(편지·메모·일기). 미연결/미구현이면 플레이스홀더. seat은 무동작.
  function onTapFurniture(f: FurnitureVM) {
    if (f.kind !== "fixture") return;
    const route = f.actionType ? FIXTURE_ROUTE[f.actionType] : undefined;
    if (route) router.push(route);
    else showToast("곧 여기서 열 수 있어요");
  }
  // 펫과 동일한 드래그 패턴(이동 시 PATCH, 안 움직이면 탭).
  function startDragFurniture(e: React.PointerEvent, f: FurnitureVM) {
    e.preventDefault();
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
      setFurniture((xs) => xs.map((q) => (q.id === f.id ? { ...q, posX: x, posY: y } : q)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        onTapFurniture(furnitureRef.current.find((q) => q.id === f.id) ?? f);
        return;
      }
      const { x, y } = toPct(ev.clientX, ev.clientY);
      setFurniture((xs) => xs.map((q) => (q.id === f.id ? { ...q, posX: x, posY: y } : q)));
      fetch(`/api/furniture/${f.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posX: x, posY: y }),
      }).catch(() => {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  async function addFurniture(file: File, kind: "seat" | "fixture", actionType: string, type: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    fd.append("actionType", actionType);
    if (type.trim()) fd.append("type", type.trim());
    const res = await fetch(`/api/pet-rooms/${room.id}/furniture`, { method: "POST", body: fd });
    if (res.ok) router.refresh();
    else alertErr(res);
  }
  async function delFurniture(id: number) {
    const res = await fetch(`/api/furniture/${id}`, { method: "DELETE" });
    if (res.ok) {
      // 이 seat을 점유 중인 펫이 있으면 점유 해제(seatOfRef: petId→furnitureId).
      for (const [petId, seatId] of seatOfRef.current) if (seatId === id) seatOfRef.current.delete(petId);
      setFurniture((xs) => xs.filter((f) => f.id !== id));
    } else alertErr(res);
  }
  async function toggleFurniturePixel(f: FurnitureVM) {
    const next = !f.pixelRender;
    setFurniture((xs) => xs.map((q) => (q.id === f.id ? { ...q, pixelRender: next } : q)));
    fetch(`/api/furniture/${f.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pixelRender: next }),
    }).catch(() => {});
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
  const [capturing, setCapturing] = useState(false);

  // 펫 룸 스크린샷 — 무대(배경+펫+말풍선+이펙트)를 PNG로. 이름표만 제외.
  // GIF/APNG는 캡처 시점의 정지 프레임으로 담긴다(움직이는 캡처는 비대상).
  async function captureRoom() {
    const el = scrollRef.current;
    if (!el || capturing) return;
    setCapturing(true);
    setStatus("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: null, // rounded-card 모서리 바깥은 투명하게
        scale: Math.min(3, window.devicePixelRatio || 2),
        useCORS: true,
        logging: false,
        ignoreElements: (node) => (node as HTMLElement).dataset?.captureHide === "name", // 이름표만 제외(말풍선·이펙트는 포함)
      });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) {
        setStatus("캡처 실패");
        return;
      }
      const safe = (room.name || "room").replace(/[^\w가-힣 -]/g, "").trim() || "room";

      // 공유 시트 대신 바로 다운로드.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `harudengbul-${safe}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus("저장됨");
    } catch {
      setStatus("캡처 실패");
    } finally {
      setCapturing(false);
    }
  }

  const pixel = (on: boolean) => (on ? ({ imageRendering: "pixelated" } as const) : {});

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes petStartle {
          0% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-18%) scale(1.1); }
          55% { transform: translateY(0) scale(0.95); }
          100% { transform: translateY(0) scale(1); }
        }
      `}</style>
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

          {/* 가구 — 펫보다 뒤 레이어(앉으면 펫이 가구 위에 그려짐). 드래그 배치, fixture 탭→기능. */}
          {furniture.map((f) => (
            <div
              key={f.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none"
              style={{ left: `${f.posX}%`, top: `${f.posY}%` }}
              onPointerDown={(e) => startDragFurniture(e, f)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.spritePath}
                alt={f.type}
                draggable={false}
                className="h-20 w-20 object-contain"
                style={{ ...pixel(f.pixelRender) }}
              />
            </div>
          ))}

          {pets.map((p) => {
            const loving = (loveUntil[p.id] ?? 0) > Date.now();
            const isWalking = walking?.petId === p.id;
            const custom = customPlay?.petId === p.id ? customPlay : null;
            const sleeping = asleep || (napUntil[p.id] ?? 0) > Date.now(); // 전역 잠 또는 개별 졸기
            const sitting = (sitUntil[p.id] ?? 0) > Date.now(); // 가구에 앉아 쉬는 중
            const startled = (startleUntil[p.id] ?? 0) > Date.now(); // 깨우면 짧게 튀는 모션
            const src = sleeping
              ? p.sleepPath ?? p.spritePath
              : sitting
                ? p.sitPath ?? p.spritePath
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
                  <div className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2">
                    <div
                      className="relative whitespace-nowrap rounded-md border border-white/25 px-2 py-1 text-[11px] text-white"
                      style={{ background: CHIP_BG, textShadow: TEXT_OUTLINE }}
                    >
                      {bubble.text}
                      {/* 꼬리(tail) — 칩과 같은 어두운 색 */}
                      <span
                        className="absolute left-1/2 top-full -translate-x-1/2"
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "5px solid transparent",
                          borderRight: "5px solid transparent",
                          borderTop: `6px solid ${CHIP_BG}`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="relative" style={{ animation: startled ? "petStartle 0.45s ease-out" : undefined }}>
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
                  {sleeping && <span className="absolute -top-1 right-0 text-sm">💤</span>}
                </div>
                {showNames && (
                  <div className="mt-1 flex justify-center" data-capture-hide="name">
                    <span
                      className="inline-block rounded border border-white/20 px-1.5 py-0.5 text-[10px] leading-tight text-white"
                      style={{ background: CHIP_BG, textShadow: TEXT_OUTLINE }}
                    >
                      {p.name}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <PetEffects effects={effects} />

          {toast && (
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
              <span
                className="rounded-full px-3 py-1 text-[11px] text-white"
                style={{ background: CHIP_BG, textShadow: TEXT_OUTLINE }}
              >
                {toast}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 메뉴 바 — 설정은 평소 접힘(무대에서 실수로 클릭하는 문제 방지). 메뉴 2개로 분리. */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => setMenu((m) => (m === "room" ? null : "room"))}
          className={`rounded-control px-3 py-1.5 ring-1 ring-border ${menu === "room" ? "bg-accent text-black" : "bg-surface"}`}
        >
          ⚙ 방 설정
        </button>
        <button
          onClick={() => setMenu((m) => (m === "pet" ? null : "pet"))}
          className={`rounded-control px-3 py-1.5 ring-1 ring-border ${menu === "pet" ? "bg-accent text-black" : "bg-surface"}`}
        >
          🐾 펫 관리
        </button>
        <button
          onClick={captureRoom}
          disabled={capturing}
          title="펫 룸 스크린샷(배경+펫+말풍선, 이름표 제외)"
          className="ml-auto rounded-control bg-surface px-3 py-1.5 ring-1 ring-border disabled:opacity-50"
        >
          {capturing ? "📷 …" : "📷"}
        </button>
      </div>
      <span className="text-[11px] opacity-40">{N > 1 ? "옆으로 스와이프 · " : ""}펫을 끌어 배치 · 탭하면 반응</span>

      {/* 방 설정 메뉴 — 분주함 · 이름표 · 배경 패널 */}
      {menu === "room" && (
        <div className="flex flex-col gap-3 rounded-card bg-surface-2 p-3 text-xs ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-10 shrink-0 opacity-60">분주함</span>
            {[
              { l: "정지", v: 0 },
              { l: "차분", v: 25 },
              { l: "보통", v: 50 },
              { l: "활발", v: 90 },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => changeLiveliness(o.v)}
                className={`rounded-control px-3 py-1 ring-1 ring-border ${liveliness === o.v ? "bg-accent text-black" : "bg-surface"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-10 shrink-0 opacity-60">이름표</span>
            <button
              onClick={toggleNames}
              className={`rounded-control px-3 py-1 ring-1 ring-border ${showNames ? "bg-accent text-black" : "bg-surface"}`}
            >
              {showNames ? "표시" : "숨김"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-10 shrink-0 opacity-60">배경</span>
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
          <FurnitureManager
            furniture={furniture}
            onAdd={addFurniture}
            onDelete={delFurniture}
            onTogglePixel={toggleFurniturePixel}
          />
        </div>
      )}

      {/* 펫 관리 메뉴 — 펫 골라 편집(모습·대사·관계·성장) */}
      {menu === "pet" && (
        <div className="flex flex-col gap-2 rounded-card bg-surface-2 p-3 ring-1 ring-border">
          <span className="text-[11px] opacity-60">펫을 골라 편집해요(모습·대사·관계·성장).</span>
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
        </div>
      )}

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

const FURNITURE_ACTIONS: { v: string; ko: string }[] = [
  { v: "letters", ko: "편지" },
  { v: "memo", ko: "메모" },
  { v: "diary", ko: "일기" },
  { v: "none", ko: "장식" },
];

// 가구 추가·목록(방 설정 메뉴 내). seat=앉는 가구 / fixture=탭하면 앱 기능 입구.
function FurnitureManager({
  furniture,
  onAdd,
  onDelete,
  onTogglePixel,
}: {
  furniture: FurnitureVM[];
  onAdd: (file: File, kind: "seat" | "fixture", actionType: string, type: string) => void;
  onDelete: (id: number) => void;
  onTogglePixel: (f: FurnitureVM) => void;
}) {
  const [kind, setKind] = useState<"seat" | "fixture">("seat");
  const [action, setAction] = useState("letters");
  const [type, setType] = useState("");
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-10 shrink-0 opacity-60">가구</span>
        {(["seat", "fixture"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-control px-2.5 py-1 ring-1 ring-border ${kind === k ? "bg-accent text-black" : "bg-surface"}`}
          >
            {k === "seat" ? "앉는 가구" : "기능 가구"}
          </button>
        ))}
        {kind === "fixture" && (
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-control bg-bg px-2 py-1 ring-1 ring-border"
          >
            {FURNITURE_ACTIONS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.ko}
              </option>
            ))}
          </select>
        )}
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="이름(선택)"
          maxLength={20}
          className="w-20 rounded-control bg-bg px-2 py-1 ring-1 ring-border"
        />
        <label className="cursor-pointer rounded-control bg-surface px-3 py-1.5 ring-1 ring-border">
          ＋ 추가
          <input
            type="file"
            accept="image/gif,image/webp,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAdd(f, kind, action, type);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {furniture.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {furniture.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 rounded-control bg-bg px-2 py-1 ring-1 ring-border">
              <span className="opacity-70">
                {f.kind === "seat" ? "🪑" : "📦"} {f.type}
              </span>
              <button
                onClick={() => onTogglePixel(f)}
                title="픽셀 렌더 토글"
                className={`px-1 ${f.pixelRender ? "text-accent" : "opacity-40"}`}
              >
                ▦
              </button>
              <button onClick={() => onDelete(f.id)} className="px-1 opacity-50 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] opacity-40">
        앉는 가구 = 펫이 다가가 앉아요(펫에 ‘앉기’ 스프라이트 필요). 기능 가구 = 탭하면 그 화면이 열려요.
      </p>
    </div>
  );
}
