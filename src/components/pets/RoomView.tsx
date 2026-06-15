"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PetEffects, { type ActiveEffect, type EffectType } from "./PetEffects";
import PetEditSheet from "./PetEditSheet";
import FurnitureSheet from "./FurnitureSheet";
import GiveItemSheet, { type GiveResult } from "./GiveItemSheet";
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
import type { PetVM, RoomVM, RelationVM, PetRef, FurnitureVM, ItemVM } from "./types";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const PINGPONG_COOLDOWN_MS = 90_000;
const STARTLE_LINES = ["꺄앗!", "으냐?!", "깜짝이야!", "헉!", "으아앙"]; // 자다 깨면 놀라는 한 마디
const PET_RADIUS_PX = 36; // 점유 반경 ≈ 스프라이트(80px) 폭 절반(약간 작게 — 살짝 겹침은 허용)
const DEFAULT_FLOOR = { top: 72, bottom: 92 }; // 패널 없을 때(기본 그라데이션) 바닥 구역
const AIR_BAND = { top: 8, bottom: 58 }; // air 펫 자율 비행 대역(상단~중단)
const SEAT_TARGET_PROB = 0.25; // 산책 시 빈 seat 가구를 목적지로 고를 확률(낮게 가중)
// 패널 단위 공간 인식 — 연인 원거리 예외(보수적, 모두 '가끔' · liveliness(L/50) 곱).
const CROSS_PANEL_PROB = 0.12; // 산책 시 가끔 옆 패널로 넘어감(기본은 현재 패널 내)
const SEEK_LOVER_PROB = 0.06; // 드물게 산책 목적지를 '연인이 있는 패널'로(연인 전용 — 혐관·가족 제외)
const GRIEF_PROB = 0.16; // 자발 발화 통과분 중, 다른 패널 연인을 그리워하는 혼잣말 비율(이펙트·핑퐁 없음)
// fixture 액션 → 앱 기능 경로. 없거나 'none'이면 순수 장식.
const FIXTURE_ROUTE: Record<string, string> = { letters: "/mailbox", memo: "/memos", diary: "/diary", achievements: "/achievements", pet_diary: "/pet-diary" };

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
  const [panels, setPanels] = useState(room.panels); // 바닥 구역 라이브 편집용
  useEffect(() => setPanels(room.panels), [room.panels]);
  const [floorEdit, setFloorEdit] = useState(false); // 바닥 구역 경계 편집 모드
  const [furnitureMode, setFurnitureMode] = useState(false); // 가구 배치 모드(드래그·편집)
  const [furnAdding, setFurnAdding] = useState(false); // 가구 추가 시트
  const [furnEditId, setFurnEditId] = useState<number | null>(null); // 가구 편집 시트
  const [items, setItems] = useState<ItemVM[]>(room.items); // 배치/지급 아이템
  useEffect(() => setItems(room.items), [room.items]);
  const [itemMode, setItemMode] = useState(false); // 아이템 배치 모드(드래그)
  const [itemAdding, setItemAdding] = useState(false); // 아이템 추가 폼
  const [itemSheetId, setItemSheetId] = useState<number | null>(null); // 아이템 액션 시트(수리·버리기)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [toast, setToast] = useState(""); // 가구 탭 등 짧은 안내
  const [walking, setWalking] = useState<{ petId: number; ms: number; flip: boolean } | null>(null);
  const [customPlay, setCustomPlay] = useState<{ petId: number; path: string; flip: boolean } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [giveOpen, setGiveOpen] = useState(false);
  // 관리 모드(기본 OFF) — 켤 때만 레이아웃 변경(가구·펫·배경·아이템 배치). 평소엔 잠금(상호작용만).
  const [manageMode, setManageMode] = useState(false);
  const manageRef = useRef(false);
  manageRef.current = manageMode;
  function toggleManage() {
    setManageMode((v) => {
      const next = !v;
      if (!next) {
        // 관리 모드 끄면 모든 편집 하위 모드·메뉴 정리(일반 모드 깔끔).
        setFurnitureMode(false);
        setItemMode(false);
        setFloorEdit(false);
        setItemAdding(false);
        setMenu(null);
      }
      return next;
    });
  }
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

  const N = Math.max(panels.length, 1); // 좌표계 패널 수(스트립 폭 = N*100%)
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  // ── 바닥 구역(floor zone) ── 패널별 위·아래 경계. posX 가 속한 패널의 구역을 돌려줌.
  function floorZoneAt(posX: number): { top: number; bottom: number } {
    const ps = panelsRef.current;
    if (ps.length === 0) return DEFAULT_FLOOR;
    const idx = Math.max(0, Math.min(ps.length - 1, Math.floor((posX / 100) * ps.length)));
    return { top: ps[idx].floorTopY, bottom: ps[idx].floorBottomY };
  }
  // ── 패널 단위 공간 인식 ── posX 가 속한 패널 인덱스. N<=1(단일 패널·기본배경)이면 항상 0 → 분리 없음(무영향).
  function panelOf(posX: number): number {
    const n = panelsRef.current.length;
    if (n <= 1) return 0;
    return Math.max(0, Math.min(n - 1, Math.floor((posX / 100) * n)));
  }
  // 패널 인덱스의 posX 범위(%).
  function panelBounds(idx: number): { lo: number; hi: number } {
    const n = Math.max(1, panelsRef.current.length);
    return { lo: (idx / n) * 100, hi: ((idx + 1) / n) * 100 };
  }
  // 드래그(수동) y 보정: ground=구역 스냅, air=자유(전체).
  function dragClampY(loco: string, posX: number, rawY: number): number {
    if (loco === "air") return Math.max(6, Math.min(96, rawY));
    const z = floorZoneAt(posX);
    return Math.max(z.top, Math.min(z.bottom, rawY));
  }
  // 산책(자동) 목적지 y: ground=바닥 구역 내(앞뒤 어슬렁) / air=비행 대역.
  function walkY(loco: string, posX: number, curY: number): number {
    const z = loco === "air" ? AIR_BAND : floorZoneAt(posX);
    const y = curY + (Math.random() * 2 - 1) * (z.bottom - z.top) * 0.6;
    return Math.max(z.top, Math.min(z.bottom, y));
  }
  // 원근 스케일(ground 한정, 2단계 — 도트 뭉갬 최소화): 앞(아래)이면 살짝 크게.
  function petScale(p: PetVM): number {
    if (p.locomotion !== "ground") return 1;
    // 화면 절대 y 기준 '연속' 원근. 패널별 floor zone 으로 계산하면 경계/구역 차이에서
    // 크기가 점프(특정 위치에서 갑자기 작아짐)하므로 절대 posY 로 매끄럽게. 60%→1.0 ~ 96%→1.15.
    const t = Math.max(0, Math.min(1, (p.posY - 60) / 36));
    return 1 + t * 0.15;
  }

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
  const crossingRef = useRef<Set<number>>(new Set()); // 패널 경계 넘는 중(과도기) — 양쪽 패널 어디에도 안 속함
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
  function pickEmptySeat(panel?: number): FurnitureVM | null {
    const occupied = new Set(seatOfRef.current.values());
    let seats = furnitureRef.current.filter((f) => f.kind === "seat" && !occupied.has(f.id));
    if (panel != null) seats = seats.filter((f) => panelOf(f.posX) === panel); // 목적 패널 내 seat 만
    return seats.length ? seats[Math.floor(Math.random() * seats.length)] : null;
  }
  // 착석 위치 — 펫 엉덩이(스프라이트 하단)를 좌석면(seat_y) 높이에 맞춤. 80px 박스 기준.
  function seatSitTarget(seat: FurnitureVM): { x: number; y: number } {
    const { H } = roomDims();
    if (!H) return { x: seat.posX, y: seat.posY };
    const box = 80 * (seat.scale || 1); // 스케일 반영한 가구 박스 px
    const seatSurfacePx = (seat.posY / 100) * H - box / 2 + (seat.seatY / 100) * box; // 박스 위에서 seat_y%
    const petCenterPx = seatSurfacePx - 40; // 펫(80px) 하단이 좌석면에 닿게 → 중심은 40px 위
    return { x: seat.posX, y: Math.max(2, Math.min(98, (petCenterPx / H) * 100)) };
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
    const loco = petsRef.current.find((p) => p.id === petId)?.locomotion ?? "ground";
    const cx = (x / 100) * W;
    const cy = (y / 100) * H;
    for (let r = 8; r <= 180; r += 8) {
      for (let a = 0; a < 360; a += 30) {
        const rad = (a * Math.PI) / 180;
        const nx = Math.max(2, Math.min(98, ((cx + Math.cos(rad) * r) / W) * 100));
        const ny = dragClampY(loco, nx, ((cy + Math.sin(rad) * r) / H) * 100); // 구역 유지
        if (!collidesAny(petId, nx, ny, W, H)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }
  // 산책 목적지 — 비충돌 지점을 최대 8회 재추첨. 다 실패하면 null(이번 틱 이동 취소).
  function pickWalkTarget(p: PetVM, ea: number, targetPanel: number): { x: number; y: number } | null {
    const { W, H } = roomDims();
    const range = wanderRange(ea);
    const b = panelBounds(targetPanel);
    const lo = Math.max(3, b.lo + 2); // 패널 경계는 살짝 안쪽까지(이음새 회피)
    const hi = Math.min(97, b.hi - 2);
    const sameP = targetPanel === panelOf(p.posX);
    for (let i = 0; i < 8; i++) {
      // 같은 패널: 현재 위치 기준 어슬렁(패널 경계 클램프) / 다른 패널: 그 패널 내 임의 지점으로 이동.
      let x = sameP ? p.posX + (Math.random() * 2 - 1) * range : b.lo + Math.random() * (b.hi - b.lo);
      x = Math.max(lo, Math.min(hi, x));
      const y = walkY(p.locomotion, x, p.posY); // ground=바닥 구역 / air=비행 대역
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
  // 그 펫의 연인 중 '지금 다른 패널에 있는' 펫 id(없으면 null). 그리움·찾아가기용(연인 전용 — isLove 만).
  function loverInOtherPanel(p: PetVM): number | null {
    if (crossingRef.current.has(p.id)) return null; // 이동 중엔 그리움·찾아가기 판단 보류
    const myPanel = panelOf(p.posX);
    for (const o of petsRef.current) {
      if (o.id === p.id || crossingRef.current.has(o.id)) continue; // 이동 중인 연인은 대상서 제외
      if (isLovePair(p.id, o.id) && panelOf(o.posX) !== myPanel) return o.id;
    }
    return null;
  }
  // 연인 원거리 그리움 혼잣말 — 상대 이름을 넣은 '여기 없는' 톤. 말풍선만(이펙트·핑퐁 없음).
  function griefLine(name: string): string {
    const pool = [
      `${name}… 어디 갔지`,
      `${name}, 보고 싶다…`,
      `${name}는 어디 간 거야`,
      `흐음, ${name} 생각나네`,
      `${name} 옆에 있으면 좋겠다…`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function aboutLineFor(p: PetVM, otherId: number): string | null {
    const opts = p.aboutLines.filter((a) => a.aboutPetId === otherId);
    return opts.length ? opts[Math.floor(Math.random() * opts.length)].content : null;
  }
  // 탭/자발 발화 공용 — 풀(solo + 같은 방 상대 about ×2)에서 랜덤 1개(kind 포함).
  function pickLine(p: PetVM): { content: string; kind: "solo" | "about_other"; aboutPetId: number | null } {
    // about_other 는 '같은 패널에 있는 상대'에 대해서만(다른 패널 펫은 인식 못 함 → 벽 너머 언급 차단).
    //   이동 중(crossing) 펫은 어느 패널에도 안 속함 — 말하는 쪽이든 대상이든 제외.
    const crossing = crossingRef.current;
    const myPanel = crossing.has(p.id) ? -1 : panelOf(p.posX);
    const panelById = new Map(
      petsRef.current.filter((x) => !crossing.has(x.id)).map((x) => [x.id, panelOf(x.posX)] as const),
    );
    const pool: { content: string; kind: "solo" | "about_other"; aboutPetId: number | null }[] =
      p.soloLines.map((content) => ({ content, kind: "solo", aboutPetId: null }));
    for (const a of p.aboutLines) {
      if (panelById.get(a.aboutPetId) === myPanel) {
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

  // 아이템 '주기' 반응 재생 — 받는 펫 말풍선 + 이펙트. '주인 부르기'면 주인이 한 마디 받아침(부르기 연출).
  //   분기·쿨다운·일일 캡은 서버(give API) 권위. 클라는 받은 payload만 재생.
  function playGive(petId: number, r: GiveResult) {
    const p = petsRef.current.find((x) => x.id === petId);
    if (!p) return;
    showBubble(petId, r.content, 3200, true);
    if (r.effect) spawnEffect(r.effect, p.posX, p.posY - 8);
    if (r.ownerCall) {
      const owner = petsRef.current.find((x) => x.id === r.ownerCall!.ownerPetId);
      if (owner) {
        setTimeout(() => {
          showBubble(owner.id, r.ownerCall!.content, 3000, true);
          spawnEffect("notes", owner.posX, owner.posY - 8);
        }, 1500);
      }
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
      if (Math.random() < 0.08 && tryItemWear()) return; // 아이템 마모(개그) — 보는 중에만, 낮은 확률
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
        if (crossingRef.current.has(a.id) || crossingRef.current.has(b.id)) continue; // 이동 중(과도기) 펫은 인식 보류
        if (panelOf(a.posX) !== panelOf(b.posX)) continue; // 다른 패널은 서로 인식 안 함(벽 너머 핑퐁·❤️·💢 차단)
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
    // ── 목적 패널 결정 ── 기본은 현재 패널. 다패널 방에서만 예외(둘 다 '가끔', liveliness 곱):
    //   ① 드물게 연인이 있는 패널로 찾아감(연인 전용) ② 가끔 옆 패널로 넘어감.
    const curPanel = panelOf(chosen.p.posX);
    let targetPanel = curPanel;
    const nP = panelsRef.current.length;
    if (nP > 1) {
      const Lf = Math.max(0, Math.min(1, L / 50));
      const loverId = loverInOtherPanel(chosen.p);
      if (loverId != null && Math.random() < SEEK_LOVER_PROB * Lf) {
        // ② 확실한 이동 — 작정하고 연인 패널로(도착 시 재회 ❤️). 보수적(낮은 확률·liveliness 곱).
        const lp = petsRef.current.find((x) => x.id === loverId);
        if (lp) targetPanel = panelOf(lp.posX);
      } else if (Math.random() < CROSS_PANEL_PROB * Math.max(0, Math.min(1, chosen.ea / 60))) {
        // ① 약한 이동 — 목적 없이 '마실' 나가 옆 패널 구경. 활동성(ea) 높을수록 자주.
        const adj: number[] = [];
        if (curPanel > 0) adj.push(curPanel - 1);
        if (curPanel < nP - 1) adj.push(curPanel + 1);
        if (adj.length) targetPanel = adj[Math.floor(Math.random() * adj.length)];
      }
    }
    const crossing = targetPanel !== curPanel; // 경계를 넘는 walk → 도착까지 과도기(인식 보류)
    // 가끔 빈 seat 가구로 향함(sit 슬롯 있는 ground 펫만). 목적 패널 내 seat 만(기본=현재 패널).
    if (chosen.p.locomotion !== "air" && chosen.p.sitPath && Math.random() < SEAT_TARGET_PROB) {
      const seat = pickEmptySeat(targetPanel);
      if (seat) {
        doWalk(chosen.p, seatSitTarget(seat), seat.id, crossing); // 좌석면(seat_y) 정렬
        return true;
      }
    }
    // 다른 펫 점유 반경 피해 재추첨, 다 실패하면 이번 틱 이동 취소.
    const target = pickWalkTarget(chosen.p, chosen.ea, targetPanel);
    if (!target) return false;
    doWalk(chosen.p, target, undefined, crossing);
    return true;
  }
  function doWalk(p: PetVM, target: { x: number; y: number }, seatId?: number, crossing = false) {
    const ms = walkDurationMs(p.posX, target.x, 7);
    const flip = shouldFlip(p.walkFacing, target.x > p.posX);
    // 경계를 넘는 중이면 '이동 중'으로 표시 — 도착까지 양쪽 패널 어디에도 안 속함(발화·인식 보류).
    if (crossing) crossingRef.current.add(p.id);
    setWalking({ petId: p.id, ms, flip });
    setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: target.x, posY: target.y } : q)));
    setTimeout(() => {
      crossingRef.current.delete(p.id); // 도착 — 그 패널 소속으로 확정, 인식 갱신(이후 핑퐁·❤️ 가능)
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
    // 연인 원거리 그리움 — 다른 패널에 있는 연인을 가끔 혼잣말로(이펙트·핑퐁 없음, 상대 패널엔 안 들림).
    //   liveliness 곱(차분한 방일수록 약하게). 혐관·가족은 isLove 아니라 해당 없음.
    const Lg = Math.max(0, Math.min(1, livelinessRef.current / 50));
    const loverId = loverInOtherPanel(p);
    if (loverId != null && Math.random() < GRIEF_PROB * Lg) {
      const lover = petsRef.current.find((x) => x.id === loverId);
      showBubble(p.id, griefLine(lover?.name ?? "…"));
      return;
    }
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
    if (walkingRef.current?.petId === p.id) {
      setWalking(null);
      crossingRef.current.delete(p.id); // 강제 정지 = 그 자리(=목적지) 도착 처리
    }
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
    if (walkingRef.current?.petId === p.id) {
      setWalking(null);
      crossingRef.current.delete(p.id); // 강제 정지 = 그 자리(=목적지) 도착 처리
    }
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
      if (!manageRef.current) return; // 일반 모드: 레이아웃 잠금(드래그로 안 움직임, 탭만)
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 6) moved = true;
      const { x, y } = toPct(ev.clientX, ev.clientY);
      const sy = dragClampY(p.locomotion, x, y); // ground=바닥 구역 스냅 / air=자유
      setPets((xs) => xs.map((q) => (q.id === p.id ? { ...q, posX: x, posY: sy } : q)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        onTap(petsRef.current.find((q) => q.id === p.id) ?? p);
        return;
      }
      const raw = toPct(ev.clientX, ev.clientY);
      const sy = dragClampY(p.locomotion, raw.x, raw.y); // 구역 스냅 후 충돌 보정
      // 다른 펫 점유 반경과 겹치면 가장 가까운 비충돌 지점으로 살짝 비켜 배치(못 찾으면 그대로).
      const { x, y } = resolvePlacement(p.id, raw.x, sy);
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
        setFurnEditId(f.id); // 가구 모드에서 탭 = 편집 시트(드래그만 이 핸들러가 붙음)
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
  // 가구(특히 seat) 삭제 시 그 seat에 앉아있던 펫을 idle 로 복귀(점유·sit 상태 해제).
  function releaseSeatPets(furnitureId: number) {
    const freed: number[] = [];
    for (const [petId, seatId] of seatOfRef.current)
      if (seatId === furnitureId) {
        seatOfRef.current.delete(petId);
        freed.push(petId);
      }
    if (freed.length) setSitUntil((m) => ({ ...m, ...Object.fromEntries(freed.map((id) => [id, 0])) }));
  }

  // ── 아이템 ── 내구도=개그 타이머. 마모는 '방 볼 때'만(visibility 가드=틱 스케줄러), 수리 무료 1탭.
  // 파손 시 같은 패널 둘째 펫의 관계 반영 페어 반응(혐관 💢 / 연인 ❤️ / 가족 투닥). 순수 템플릿.
  function pairBreakLineLocal(
    label: string | null,
    isLove: boolean,
    otherName: string,
  ): { content: string; effect: "anger" | "hearts" | null } {
    const l = (label ?? "").toLowerCase();
    if (/혐관|앙숙|라이벌|rival|적|싫/.test(l)) return { content: `${otherName}가 그랬어! 난 안 그랬어`, effect: "anger" };
    if (isLove) return { content: `우리… 못 본 걸로 하자`, effect: "hearts" };
    if (/형제|남매|자매|가족|sibling|brother|sister|family|쌍둥이/.test(l)) return { content: `야 ${otherName}, 네가 깼지!`, effect: null };
    return { content: `${otherName}, 봤어? 깨졌어…`, effect: null };
  }
  // 반응 대사 1줄(서버 캐시-또는-생성) → 말풍선.
  async function reactItem(itemId: number, petId: number, kind: "receive" | "break") {
    try {
      const res = await fetch(`/api/pet-items/${itemId}/reactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ petId, kind }),
      });
      if (!res.ok) return;
      const d = await res.json();
      if (d.content) showBubble(petId, d.content, 3000, true);
    } catch {
      /* ignore */
    }
  }
  function onItemBreak(it: ItemVM, breaker: PetVM) {
    void reactItem(it.id, breaker.id, "break");
    const other = petsRef.current.find(
      (o) => o.id !== breaker.id && panelOf(o.posX) === panelOf(it.posX) && !isNapping(o.id),
    );
    if (!other) return;
    const rel = relations.find(
      (r) => (r.petAId === breaker.id && r.petBId === other.id) || (r.petAId === other.id && r.petBId === breaker.id),
    );
    const pair = pairBreakLineLocal(rel?.label ?? null, !!rel?.isLove, breaker.name);
    setTimeout(() => {
      showBubble(other.id, pair.content, 2600);
      if (pair.effect === "anger") spawnEffect("anger", other.posX, other.posY - 8);
      else if (pair.effect === "hearts") loveBurst(other.id, other.posX, other.posY);
    }, 1500);
  }
  // 마모 1회 시도(개그) — 보이는 마모성 아이템 근처의 깨어있는 펫이 '떨어뜨림'. 0 되면 파손.
  function tryItemWear(): boolean {
    const wearable = itemsRef.current.filter(
      (it) => it.durabilityMax != null && it.durabilityNow > 0 && isVisible(it.posX),
    );
    if (wearable.length === 0) return false;
    const it = wearable[Math.floor(Math.random() * wearable.length)];
    const near = petsRef.current.filter(
      (p) =>
        panelOf(p.posX) === panelOf(it.posX) &&
        Math.abs(p.posX - it.posX) < 22 &&
        !isNapping(p.id) &&
        walkingRef.current?.petId !== p.id,
    );
    if (near.length === 0) return false;
    const p = near[Math.floor(Math.random() * near.length)];
    spawnEffect(Math.random() < 0.5 ? "notes" : "sparkle", it.posX, it.posY - 8);
    showBubble(p.id, "앗… 떨어뜨렸어", 2200);
    fetch(`/api/pet-items/${it.id}/wear`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.durabilityNow == null) return; // 무한 등
        setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, durabilityNow: d.durabilityNow } : q)));
        if (d.broke) onItemBreak(it, p);
      })
      .catch(() => {});
    return true;
  }
  // 아이템 드래그(아이템 모드) — 펫·가구와 동일 패턴. 안 움직이면 액션 시트.
  function startDragItem(e: React.PointerEvent, it: ItemVM) {
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
      setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, posX: x, posY: y } : q)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) {
        setItemSheetId(it.id);
        return;
      }
      const { x, y } = toPct(ev.clientX, ev.clientY);
      setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, posX: x, posY: y } : q)));
      fetch(`/api/pet-items/${it.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posX: x, posY: y }),
      }).catch(() => {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  async function repairItem(it: ItemVM) {
    setItemSheetId(null);
    const res = await fetch(`/api/pet-items/${it.id}/repair`, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, durabilityNow: d.durabilityNow ?? q.durabilityMax ?? 0 } : q)));
    }
  }
  function deleteItem(it: ItemVM) {
    setItemSheetId(null);
    setItems((xs) => xs.filter((q) => q.id !== it.id));
    fetch(`/api/pet-items/${it.id}`, { method: "DELETE" }).catch(() => {});
  }
  function setItemPixel(it: ItemVM, v: boolean) {
    setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, pixelRender: v } : q)));
    fetch(`/api/pet-items/${it.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pixelRender: v }),
    }).catch(() => {});
  }
  // 크기 조절 — 라이브 미리보기는 state, 저장은 디바운스(슬라이더 연속 변경 → 마지막 값 1회 PATCH).
  const itemScaleSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setItemScale(it: ItemVM, v: number) {
    const scale = Math.max(0.3, Math.min(3, v));
    setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, scale } : q)));
    if (itemScaleSaveRef.current) clearTimeout(itemScaleSaveRef.current);
    itemScaleSaveRef.current = setTimeout(() => {
      fetch(`/api/pet-items/${it.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scale }),
      }).catch(() => {});
    }, 300);
  }
  async function uploadItemBroken(it: ItemVM, file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/pet-items/${it.id}/broken-sprite`, { method: "POST", body: fd }).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, brokenSpritePath: d.brokenSpritePath } : q)));
    }
  }
  function clearItemBroken(it: ItemVM) {
    setItems((xs) => xs.map((q) => (q.id === it.id ? { ...q, brokenSpritePath: null } : q)));
    fetch(`/api/pet-items/${it.id}/broken-sprite`, { method: "DELETE" }).catch(() => {});
  }
  function onItemAdded(row: ItemVM, heldPetId: number | null) {
    setItems((xs) => [...xs, row]);
    const target = heldPetId ?? petsRef.current[0]?.id;
    if (target) setTimeout(() => void reactItem(row.id, target, "receive"), 400); // 지급/배치 순간 receive 반응
  }

  // ── 바닥 구역 경계 드래그(패널별 위/아래 선) ──
  function dragFloor(e: React.PointerEvent, panelId: number, which: "top" | "bottom") {
    e.preventDefault();
    e.stopPropagation();
    const inner = innerRef.current;
    if (!inner) return;
    const move = (ev: PointerEvent) => {
      const rect = inner.getBoundingClientRect();
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      setPanels((ps) =>
        ps.map((p) =>
          p.id !== panelId
            ? p
            : which === "top"
              ? { ...p, floorTopY: Math.min(y, p.floorBottomY - 2) }
              : { ...p, floorBottomY: Math.max(y, p.floorTopY + 2) },
        ),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pn = panelsRef.current.find((x) => x.id === panelId);
      if (pn)
        fetch(`/api/pet-rooms/${room.id}/backgrounds/${panelId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ floorTopY: pn.floorTopY, floorBottomY: pn.floorBottomY }),
        }).catch(() => {});
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── 방에 펫 들이기 ── (전역 펫을 이 방으로 배정 / 이 방에서 신규 생성)
  async function bringPetToRoom(petId: number) {
    const res = await fetch(`/api/pets/${petId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId: room.id }),
    });
    if (res.ok) router.refresh();
    else alertErr(res);
  }
  async function createPetHere(name: string) {
    const res = await fetch("/api/pets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, roomId: room.id }),
    });
    if (res.ok) router.refresh();
    else alertErr(res);
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
          {panels.length === 0 ? (
            <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-surface" />
          ) : (
            panels.map((panel, i) => (
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

          {/* 바닥 구역 편집 — 패널별 위·아래 경계선(드래그로 조절). */}
          {floorEdit &&
            panels.map((panel, i) => {
              const left = (i * 100) / N;
              const width = 100 / N;
              return (
                <div key={`fz-${panel.id}`}>
                  {/* 구역 음영 */}
                  <div
                    className="pointer-events-none absolute bg-accent/15"
                    style={{ left: `${left}%`, width: `${width}%`, top: `${panel.floorTopY}%`, height: `${panel.floorBottomY - panel.floorTopY}%` }}
                  />
                  {(["top", "bottom"] as const).map((which) => {
                    const yv = which === "top" ? panel.floorTopY : panel.floorBottomY;
                    return (
                      <div
                        key={which}
                        onPointerDown={(e) => dragFloor(e, panel.id, which)}
                        className="absolute -translate-y-1/2 cursor-ns-resize touch-none"
                        style={{ left: `${left}%`, width: `${width}%`, top: `${yv}%`, height: 14 }}
                      >
                        <div className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 bg-accent" />
                        <div className="absolute left-1/2 top-1/2 h-3 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
                      </div>
                    );
                  })}
                </div>
              );
            })}

          {/* 가구 — 펫보다 뒤 레이어(앉으면 펫이 가구 위에). 가구 모드=드래그·탭편집 / 일반=fixture 탭→기능.
              active(예: 안 읽은 편지)면 alt 스프라이트. 두 스프라이트 하단정렬(objectPosition bottom)로 전환 시 안 들썩. */}
          {furniture.map((f) => {
            const fsrc = f.active && f.spriteAltPath ? f.spriteAltPath : f.spritePath;
            return (
              <div
                key={f.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none"
                style={{ left: `${f.posX}%`, top: `${f.posY}%` }}
                onPointerDown={furnitureMode ? (e) => startDragFurniture(e, f) : undefined}
                onClick={furnitureMode ? undefined : () => onTapFurniture(f)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fsrc}
                  alt={f.type}
                  draggable={false}
                  className={`h-20 w-20 object-contain ${furnitureMode ? "rounded ring-2 ring-accent/60" : ""}`}
                  style={{
                    objectPosition: "bottom",
                    ...pixel(f.pixelRender),
                    transform: `rotate(${f.rotation}deg) scale(${f.scale})`,
                  }}
                />
              </div>
            );
          })}

          {/* 아이템 — 가구처럼 펫보다 뒤 레이어. 파손(durability 0)이면 금 간 오버레이(CSS 선 2개).
              아이템 모드=드래그·탭 시트 / 일반=탭하면 수리·버리기 시트. */}
          {items.map((it) => {
            const broken = it.durabilityMax != null && it.durabilityNow === 0;
            // 파손 모양 스프라이트가 있으면 그걸로 교체, 없으면 기본 스프라이트 + CSS 금 오버레이.
            const useBrokenSprite = broken && !!it.brokenSpritePath;
            const isrc = useBrokenSprite ? it.brokenSpritePath! : it.spritePath;
            return (
              <div
                key={`item-${it.id}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 touch-none select-none"
                style={{ left: `${it.posX}%`, top: `${it.posY}%` }}
                onPointerDown={itemMode ? (e) => startDragItem(e, it) : undefined}
                onClick={itemMode ? undefined : () => setItemSheetId(it.id)}
              >
                <div className="relative h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={isrc}
                    alt={it.name}
                    draggable={false}
                    className={`h-16 w-16 object-contain ${itemMode ? "rounded ring-2 ring-accent/60" : ""}`}
                    style={{ objectPosition: "bottom", ...pixel(it.pixelRender), transform: `scale(${it.scale})`, filter: broken && !useBrokenSprite ? "grayscale(0.5) brightness(0.92)" : undefined }}
                  />
                  {broken && !useBrokenSprite && (
                    <span className="pointer-events-none absolute inset-0" aria-hidden>
                      <span className="absolute left-1/2 top-1/2 h-12 w-px -translate-x-1/2 -translate-y-1/2 rotate-[20deg] bg-black/55" />
                      <span className="absolute left-1/2 top-1/2 h-9 w-px -translate-x-[2px] -translate-y-1/2 -rotate-[35deg] bg-black/55" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

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
            // 착석 중이면 sit 스프라이트를 가구 facing 에 맞춤(sit_facing 과 다르면 반전, walk 반전 로직 재사용).
            let sitFlip = false;
            if (sitting) {
              const seatId = seatOfRef.current.get(p.id);
              const seat = seatId != null ? furniture.find((fr) => fr.id === seatId) : undefined;
              if (seat) sitFlip = shouldFlip(p.sitFacing, seat.facing === "right");
            }
            const flip = isWalking ? walking!.flip : sitting ? sitFlip : false;
            const scale = petScale(p); // 원근(ground 한정, 2단계)
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
                      style={{ ...pixel(p.pixelRender), transform: `scaleX(${flip ? -scale : scale}) scaleY(${scale})` }}
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

      {/* 메뉴 바 — 관리 모드 토글이 중심. 평소(일반 모드)엔 편집 버튼 숨김·레이아웃 잠금. */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={toggleManage}
          title="켜면 가구·펫·배경을 옮기고 바꿀 수 있어요. 평소엔 꺼두면 무대가 흐트러지지 않아요."
          className={`rounded-control px-3 py-1.5 ring-1 ring-border ${manageMode ? "bg-accent text-black" : "bg-surface"}`}
        >
          🛠 {manageMode ? "관리 모드 ON" : "관리 모드"}
        </button>
        {manageMode ? (
          <>
            <button
              onClick={() => setMenu((m) => (m === "room" ? null : "room"))}
              className={`rounded-control px-3 py-1.5 ring-1 ring-border ${menu === "room" ? "bg-accent text-black" : "bg-surface"}`}
            >
              ⚙ 방
            </button>
            <button
              onClick={() => setMenu((m) => (m === "pet" ? null : "pet"))}
              className={`rounded-control px-3 py-1.5 ring-1 ring-border ${menu === "pet" ? "bg-accent text-black" : "bg-surface"}`}
            >
              🐾 펫
            </button>
            <button
              onClick={() => { setFurnitureMode((v) => !v); setItemMode(false); setMenu(null); }}
              className={`rounded-control px-3 py-1.5 ring-1 ring-border ${furnitureMode ? "bg-accent text-black" : "bg-surface"}`}
            >
              🪑 가구
            </button>
            <button
              onClick={() => { setItemMode((v) => !v); setFurnitureMode(false); setMenu(null); }}
              className={`rounded-control px-3 py-1.5 ring-1 ring-border ${itemMode ? "bg-accent text-black" : "bg-surface"}`}
            >
              🎁 아이템 배치
            </button>
          </>
        ) : (
          pets.length > 0 && (
            <button
              onClick={() => setGiveOpen(true)}
              className="rounded-control bg-accent px-3 py-1.5 font-medium text-black"
            >
              🧺 아이템 주기
            </button>
          )
        )}
        <button
          onClick={captureRoom}
          disabled={capturing}
          title="펫 룸 스크린샷(배경+펫+말풍선, 이름표 제외)"
          className="ml-auto rounded-control bg-surface px-3 py-1.5 ring-1 ring-border disabled:opacity-50"
        >
          {capturing ? "📷 …" : "📷"}
        </button>
      </div>

      {!manageMode ? (
        <span className="text-[11px] opacity-40">{N > 1 ? "옆으로 스와이프 · " : ""}펫을 탭하면 반응 · 🧺로 아이템을 줘 보세요</span>
      ) : furnitureMode ? (
        <div className="flex items-center gap-2 rounded-card bg-surface-2 p-2 text-xs ring-1 ring-border">
          <span className="opacity-60">가구 배치 중 — 끌어 옮기고, 탭하면 편집</span>
          <button onClick={() => setFurnAdding(true)} className="ml-auto rounded-control bg-accent px-3 py-1.5 font-medium text-black">
            ＋ 가구
          </button>
          <button onClick={() => setFurnitureMode(false)} className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border">
            완료
          </button>
        </div>
      ) : itemMode ? (
        <div className="flex flex-col gap-2 rounded-card bg-surface-2 p-2 text-xs ring-1 ring-border">
          <div className="flex items-center gap-2">
            <span className="opacity-60">아이템 배치 중 — 끌어 옮기고, 탭하면 수리·버리기</span>
            <button onClick={() => setItemAdding((v) => !v)} className="ml-auto rounded-control bg-accent px-3 py-1.5 font-medium text-black">
              ＋ 아이템
            </button>
            <button onClick={() => { setItemMode(false); setItemAdding(false); }} className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border">
              완료
            </button>
          </div>
          {itemAdding && (
            <ItemAddForm
              roomId={room.id}
              pets={pets.map((p) => ({ id: p.id, name: p.name }))}
              onAdded={(row, held) => { onItemAdded(row, held); setItemAdding(false); }}
            />
          )}
        </div>
      ) : (
        <span className="text-[11px] opacity-40">관리 모드 — 펫을 끌어 배치 · 위 ‘가구/아이템 배치’로 꾸미기 · 끄면 잠겨요</span>
      )}

      {/* 방 설정 메뉴 — 분주함 · 이름표 · 배경 패널 (관리 모드에서만) */}
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
            <span className="ml-2 w-12 shrink-0 opacity-60">바닥</span>
            <button
              onClick={() => setFloorEdit((v) => !v)}
              className={`rounded-control px-3 py-1 ring-1 ring-border ${floorEdit ? "bg-accent text-black" : "bg-surface"}`}
              title="배경마다 펫이 설 바닥 구역을 위·아래 선으로 맞춰요(ground 펫 전용)."
            >
              {floorEdit ? "구역 조절 중" : "바닥 구역"}
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
          <p className="border-t border-border pt-2 text-[10px] opacity-40">
            가구(앉는 자리·우체통 등)는 위 메뉴의 ‘🪑 가구’ 모드에서 추가·배치·편집해요.
          </p>
        </div>
      )}

      {/* 펫 관리 메뉴 — 이 방 펫 편집 + 다른 펫 데려오기/신규 생성 */}
      {menu === "pet" && (
        <div className="flex flex-col gap-3 rounded-card bg-surface-2 p-3 ring-1 ring-border">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] opacity-60">이 방 펫을 골라 편집해요(모습·대사·관계·성장).</span>
            <div className="flex flex-wrap gap-2">
              {pets.length === 0 && <span className="text-[11px] opacity-40">이 방엔 아직 펫이 없어요.</span>}
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
          <RoomPetAdder
            candidates={allPets.filter((ap) => !pets.some((p) => p.id === ap.id))}
            onBring={bringPetToRoom}
            onCreate={createPetHere}
          />
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

      {giveOpen && (
        <GiveItemSheet
          pets={pets.map((p) => ({ id: p.id, name: p.name }))}
          ownerNames={new Map(allPets.map((p) => [p.id, p.name]))}
          onClose={() => setGiveOpen(false)}
          onGiven={(petId, r) => playGive(petId, r)}
        />
      )}

      {(furnAdding || furnEditId != null) && (
        <FurnitureSheet
          roomId={room.id}
          furniture={furnEditId != null ? furniture.find((f) => f.id === furnEditId) ?? null : null}
          onClose={() => {
            setFurnAdding(false);
            setFurnEditId(null);
          }}
          onSaved={() => {
            setFurnAdding(false);
            setFurnEditId(null);
            router.refresh();
          }}
          onDeleted={(id) => {
            releaseSeatPets(id); // 앉아있던 펫 idle 복귀
            setFurnEditId(null);
            router.refresh();
          }}
        />
      )}

      {/* 아이템 액션 시트 — 수리(무료 1탭)·버리기·픽셀·소지 펫. 파손/마모 시 수리로 즉시 복구. */}
      {itemSheetId != null && (() => {
        const it = items.find((q) => q.id === itemSheetId);
        if (!it) return null;
        const infinite = it.durabilityMax == null;
        const needsRepair = !infinite && it.durabilityNow < (it.durabilityMax ?? 0);
        return (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3" onClick={() => setItemSheetId(null)}>
            <div className="w-full max-w-sm rounded-card bg-surface p-3 ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{it.name}</span>
                <span className="text-xs opacity-60">
                  {infinite ? "내구도 무한" : `내구도 ${it.durabilityNow}/${it.durabilityMax}${it.durabilityNow === 0 ? " · 파손" : ""}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsRepair && (
                  <button onClick={() => repairItem(it)} className="rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-black">
                    🔧 수리(무료)
                  </button>
                )}
                <button
                  onClick={() => setItemPixel(it, !it.pixelRender)}
                  className="rounded-control bg-surface-2 px-3 py-1.5 text-sm ring-1 ring-border"
                >
                  픽셀 {it.pixelRender ? "끄기" : "켜기"}
                </button>
                <button onClick={() => deleteItem(it)} className="rounded-control px-3 py-1.5 text-sm text-danger ring-1 ring-border">
                  버리기
                </button>
                <button onClick={() => setItemSheetId(null)} className="ml-auto rounded-control bg-surface-2 px-3 py-1.5 text-sm ring-1 ring-border">
                  닫기
                </button>
              </div>
              {/* 크기 조절 — 너무 크게/작게 보일 때. */}
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-[11px]">
                <span className="w-8 shrink-0 opacity-60">크기</span>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.05}
                  value={it.scale}
                  onChange={(e) => setItemScale(it, Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="w-10 shrink-0 text-right opacity-60">{it.scale.toFixed(2)}×</span>
              </div>
              {/* 파손 모양 — 업로드/교체/해제. 없으면 깨질 때 CSS 금만. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-[11px]">
                <span className="opacity-60">파손 모양{it.brokenSpritePath ? " ✓" : " 없음"}</span>
                <label className="cursor-pointer rounded-control bg-surface-2 px-2 py-1 ring-1 ring-border">
                  {it.brokenSpritePath ? "교체" : "추가"}
                  <input
                    type="file"
                    accept="image/png,image/webp,image/gif,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadItemBroken(it, f);
                    }}
                  />
                </label>
                {it.brokenSpritePath && (
                  <button onClick={() => clearItemBroken(it)} className="rounded-control px-2 py-1 ring-1 ring-border opacity-80">
                    해제
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 아이템 추가 폼 — 스프라이트 + 이름 + 내구도 상한(무한 옵션) + (선택) 특정 펫에게 주기 + 픽셀.
function ItemAddForm({
  roomId,
  pets,
  onAdded,
}: {
  roomId: number;
  pets: PetRef[];
  onAdded: (row: ItemVM, heldPetId: number | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [brokenFile, setBrokenFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [infinite, setInfinite] = useState(false);
  const [dur, setDur] = useState(5);
  const [held, setHeld] = useState<string>("");
  const [pixel, setPixel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!file) return setErr("스프라이트를 선택하세요.");
    if (!name.trim()) return setErr("이름을 입력하세요.");
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("file", file);
    if (brokenFile) fd.set("brokenFile", brokenFile);
    fd.set("name", name.trim());
    fd.set("durabilityMax", infinite ? "infinite" : String(Math.max(1, dur)));
    fd.set("pixelRender", String(pixel));
    if (held) fd.set("heldByPetId", held);
    try {
      const res = await fetch(`/api/pet-rooms/${roomId}/items`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.item) {
        onAdded(d.item as ItemVM, held ? Number(held) : null);
        setName("");
        setFile(null);
      } else {
        setErr(d.error ?? "추가 실패");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="image/png,image/webp,image/gif,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[11px]" />
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="이름(예: 공)" className="w-28 rounded-control bg-bg px-2 py-1.5 ring-1 ring-border" />
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[11px] opacity-80">
        파손 모양(선택)
        <input type="file" accept="image/png,image/webp,image/gif,image/jpeg" onChange={(e) => setBrokenFile(e.target.files?.[0] ?? null)} className="text-[11px]" />
        <span className="opacity-50">없으면 깨질 때 금만 가요</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 opacity-80">
          <input type="checkbox" checked={infinite} onChange={(e) => setInfinite(e.target.checked)} /> 무한(안 깨짐)
        </label>
        {!infinite && (
          <label className="flex items-center gap-1 opacity-80">
            내구도
            <input type="number" min={1} max={999} value={dur} onChange={(e) => setDur(Number(e.target.value) || 1)} className="w-16 rounded-control bg-bg px-2 py-1 ring-1 ring-border" />
          </label>
        )}
        <label className="flex items-center gap-1 opacity-80">
          <input type="checkbox" checked={pixel} onChange={(e) => setPixel(e.target.checked)} /> 픽셀
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={held} onChange={(e) => setHeld(e.target.value)} className="rounded-control bg-bg px-2 py-1.5 ring-1 ring-border" disabled={pets.length === 0}>
          <option value="">방에 두기</option>
          {pets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}에게 주기</option>
          ))}
        </select>
        <button onClick={submit} disabled={busy} className="ml-auto rounded-control bg-accent px-3 py-1.5 font-medium text-black disabled:opacity-50">
          {busy ? "추가 중…" : "추가"}
        </button>
      </div>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </div>
  );
}

// 방에 펫 들이기 — 대기/다른 방 펫을 이 방으로 배정, 또는 이 방에서 신규 생성.
function RoomPetAdder({
  candidates,
  onBring,
  onCreate,
}: {
  candidates: PetRef[];
  onBring: (petId: number) => void;
  onCreate: (name: string) => void;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2 text-xs">
      <span className="opacity-60">이 방에 펫 들이기</span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pick ?? ""}
          onChange={(e) => setPick(e.target.value ? Number(e.target.value) : null)}
          className="rounded-control bg-bg px-2 py-1.5 ring-1 ring-border disabled:opacity-40"
          disabled={candidates.length === 0}
        >
          <option value="">{candidates.length ? "데려올 펫…" : "데려올 펫 없음"}</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => pick != null && onBring(pick)}
          disabled={pick == null}
          className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border disabled:opacity-40"
        >
          이 방으로
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 펫 이름"
          maxLength={30}
          className="w-28 rounded-control bg-bg px-2 py-1.5 ring-1 ring-border"
        />
        <button
          onClick={() => {
            if (name.trim()) {
              onCreate(name.trim());
              setName("");
            }
          }}
          className="rounded-control bg-accent px-3 py-1.5 font-medium text-black"
        >
          ＋ 새 펫
        </button>
      </div>
    </div>
  );
}
