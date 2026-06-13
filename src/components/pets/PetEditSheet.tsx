"use client";

import { useEffect, useState, useCallback } from "react";
import { useDialog } from "@/components/ui/Dialog";
import { pickWalkPath, type Stage } from "@/lib/pets";
import { shouldFlip } from "@/lib/petroom";
import type { PetRef } from "./types";

const STAGES = ["baby", "teen", "adult"] as const;
const KINDS = ["idle", "sleep", "walk", "love"] as const;
const STAGE_KO: Record<string, string> = { baby: "새끼", teen: "청소년", adult: "어른" };
const KIND_KO: Record<string, string> = { idle: "기본", sleep: "잠", walk: "걷기", love: "연인" };

interface Detail {
  pet: {
    id: number;
    name: string;
    personality: string | null;
    pixelRender: boolean;
    roomId: number;
    growthPoints: number;
    teenThreshold: number;
    adultThreshold: number;
    stage: string;
    talkativeness: number;
    displayStage: string | null;
    walkFacing: "left" | "right";
    reachedStages: string[];
  };
  sprites: { stage: string; kind: string; path: string }[];
  lines: { id: number; stage: string; kind: string; aboutPetId: number | null; content: string; source: string }[];
  relations: { petAId: number; petBId: number; relationLabel: string }[];
  customSprites: { id: number; stage: string; name: string; path: string; frequency: string; line: string | null }[];
}

const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function PetEditSheet({
  petId,
  rooms,
  allPets,
  onClose,
  onChanged,
}: {
  petId: number;
  rooms: PetRef[];
  allPets: PetRef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"info" | "sprites" | "motion" | "lines" | "relations">("info");

  const load = useCallback(async () => {
    const res = await fetch(`/api/pets/${petId}`);
    if (res.ok) setD(await res.json());
  }, [petId]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-card bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {!d ? (
          <p className="py-8 text-center text-sm opacity-50">불러오는 중…</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {(["info", "sprites", "motion", "lines", "relations"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-control px-3 py-1.5 ${tab === t ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}
                >
                  {{ info: "정보", sprites: "모습", motion: "모션", lines: "대사", relations: "관계" }[t]}
                </button>
              ))}
            </div>
            {tab === "info" && <InfoTab d={d} rooms={rooms} onChanged={onChanged} reload={load} />}
            {tab === "sprites" && <SpritesTab d={d} reload={load} onChanged={onChanged} />}
            {tab === "motion" && <MotionTab d={d} reload={load} onChanged={onChanged} />}
            {tab === "lines" && <LinesTab d={d} allPets={allPets} reload={load} onChanged={onChanged} />}
            {tab === "relations" && <RelationsTab d={d} allPets={allPets} reload={load} onChanged={onChanged} />}
          </>
        )}
      </div>
    </div>
  );
}

function GrowthBar({ d }: { d: Detail }) {
  const { growthPoints, teenThreshold, adultThreshold, stage } = d.pet;
  const next = stage === "baby" ? teenThreshold : stage === "teen" ? adultThreshold : null;
  const base = stage === "baby" ? 0 : stage === "teen" ? teenThreshold : adultThreshold;
  const pct = next ? Math.min(100, ((growthPoints - base) / (next - base)) * 100) : 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] opacity-60">
        <span>성장 · {STAGE_KO[stage]}</span>
        <span>{next ? `${growthPoints} / ${next}` : `${growthPoints} (다 자람)`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg ring-1 ring-border">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// 걷기 미리보기 — 현재 facing 기준, 왼쪽/오른쪽 이동 시 펫이 바라보는 모습을 즉석 표시.
function WalkPreview({
  sprites,
  stage,
  walkFacing,
  pixel,
}: {
  sprites: { stage: string; kind: string; path: string }[];
  stage: Stage;
  walkFacing: "left" | "right";
  pixel: boolean;
}) {
  const walkPath = pickWalkPath(sprites, stage);
  const hasWalk = !!sprites.find((s) => s.stage === stage && s.kind === "walk");
  const sty = pixel ? ({ imageRendering: "pixelated" } as const) : {};
  if (!walkPath) {
    return (
      <p className="text-[11px] opacity-50">
        이 모습에 걷기(walk) 스프라이트가 없어요 — 산책하지 않아요(미끄러짐 방지).
      </p>
    );
  }
  const dirs: { label: string; movingRight: boolean }[] = [
    { label: "← 왼쪽으로", movingRight: false },
    { label: "오른쪽으로 →", movingRight: true },
  ];
  return (
    <div className="flex items-center gap-3 rounded-control bg-bg p-2 ring-1 ring-border">
      {dirs.map((dir) => (
        <div key={dir.label} className="flex flex-col items-center gap-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={walkPath}
            alt={dir.label}
            className="h-14 w-14 object-contain"
            style={{
              ...sty,
              transform: shouldFlip(walkFacing, dir.movingRight) ? "scaleX(-1)" : undefined,
            }}
          />
          <span className="text-[10px] opacity-60">{dir.label}</span>
        </div>
      ))}
      {!hasWalk && <span className="text-[10px] opacity-40">(하위 스테이지 walk 폴백)</span>}
    </div>
  );
}

function InfoTab({ d, rooms, onChanged, reload }: { d: Detail; rooms: PetRef[]; onChanged: () => void; reload: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(d.pet.name);
  const [personality, setPersonality] = useState(d.pet.personality ?? "");
  const [pixel, setPixel] = useState(d.pet.pixelRender);
  const [roomId, setRoomId] = useState(d.pet.roomId);
  const [talkativeness, setTalk] = useState(d.pet.talkativeness);
  const [displayStage, setDisplayStage] = useState<string>(d.pet.displayStage ?? "");
  const [walkFacing, setWalkFacing] = useState<"left" | "right">(d.pet.walkFacing);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/pets/${d.pet.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        personality: personality.trim() || null,
        pixelRender: pixel,
        roomId,
        talkativeness,
        displayStage: displayStage || null,
        walkFacing,
      }),
    });
    setSaving(false);
    reload();
    onChanged();
  }
  async function remove() {
    if (!(await dialog.confirm({ message: "이 펫을 삭제할까요? 되돌릴 수 없어요.", danger: true, confirmText: "삭제" }))) return;
    await fetch(`/api/pets/${d.pet.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <GrowthBar d={d} />
      <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="이름" />
      <textarea
        value={personality}
        onChange={(e) => setPersonality(e.target.value)}
        rows={3}
        className={`${input} resize-none`}
        placeholder="성격 (대사 톤에 반영돼요)"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">방</span>
        <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))} className={input}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {/* 모습(표시 스테이지) — 도달한 스테이지만 노출 */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs opacity-60">모습</span>
        <select value={displayStage} onChange={(e) => setDisplayStage(e.target.value)} className={input}>
          <option value="">현재 모습 (자동)</option>
          {d.pet.reachedStages.map((s) => (
            <option key={s} value={s}>
              {{ baby: "새끼", teen: "청소년", adult: "어른" }[s] ?? s}
            </option>
          ))}
        </select>
      </div>
      {/* 수다스러움 */}
      <div>
        <div className="mb-1 flex justify-between text-xs opacity-60">
          <span>수다스러움</span>
          <span>{talkativeness}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={talkativeness}
          onChange={(e) => setTalk(Number(e.target.value))}
          className="w-full accent-[color:var(--accent)]"
        />
        <p className="text-[11px] opacity-40">0이면 자발 발화 없음(탭 반응은 유지).</p>
      </div>
      {/* walk GIF 기본 진행 방향 + 미리보기(이동 시 어느 쪽을 보는지 즉석 확인) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-xs opacity-60">걷기 GIF 기본 방향</span>
          <div className="flex gap-1.5">
            {(["left", "right"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setWalkFacing(f)}
                className={`rounded-control px-3 py-1 text-xs ${walkFacing === f ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}
              >
                {f === "left" ? "← 왼쪽" : "오른쪽 →"}
              </button>
            ))}
          </div>
        </div>
        <WalkPreview
          sprites={d.sprites}
          stage={(displayStage || d.pet.stage) as Stage}
          walkFacing={walkFacing}
          pixel={pixel}
        />
      </div>
      <label className="flex items-center justify-between text-sm">
        <span>픽셀 렌더링</span>
        <button
          type="button"
          onClick={() => setPixel((v) => !v)}
          className={`h-6 w-11 rounded-full transition ${pixel ? "bg-accent" : "bg-white/15"}`}
        >
          <span className={`block h-5 w-5 rounded-full bg-white transition ${pixel ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </label>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          {saving ? "저장 중…" : "저장"}
        </button>
        <button onClick={remove} className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border hover:text-red-400">
          삭제
        </button>
      </div>
    </div>
  );
}

function SpritesTab({ d, reload, onChanged }: { d: Detail; reload: () => void; onChanged: () => void }) {
  const get = (st: string, kd: string) => d.sprites.find((s) => s.stage === st && s.kind === kd)?.path ?? null;
  const [msg, setMsg] = useState("");

  async function upload(stage: string, kind: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("stage", stage);
    fd.append("kind", kind);
    const res = await fetch(`/api/pets/${d.pet.id}/sprites`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? j.warning ?? "올렸어요." : j.error ?? "업로드 실패");
    reload();
    onChanged(); // 방 화면에 즉시 반영
  }
  async function del(stage: string, kind: string) {
    await fetch(`/api/pets/${d.pet.id}/sprites`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, kind }),
    });
    reload();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] opacity-50">필수는 새끼 · 기본 1장이면 충분해요. 나머지는 천천히 채워도 돼요(폴백 적용).</p>
      {msg && <p className="text-[11px] text-accent">{msg}</p>}
      {STAGES.map((st) => (
        <div key={st}>
          <div className="mb-1 text-xs opacity-60">{STAGE_KO[st]}</div>
          <div className="grid grid-cols-4 gap-2">
            {KINDS.map((kd) => {
              const path = get(st, kd);
              return (
                <div key={kd} className="flex flex-col items-center gap-1">
                  <label className="relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-control bg-bg ring-1 ring-border">
                    {path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={path} alt={kd} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-lg opacity-30">＋</span>
                    )}
                    <input
                      type="file"
                      accept="image/gif,image/webp,image/png"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && upload(st, kd, e.target.files[0])}
                    />
                  </label>
                  <span className="text-[10px] opacity-50">{KIND_KO[kd]}</span>
                  {path && (
                    <button onClick={() => del(st, kd)} className="text-[10px] opacity-40 hover:text-red-400">
                      비우기
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MotionTab({ d, reload, onChanged }: { d: Detail; reload: () => void; onChanged: () => void }) {
  const STAGES_KO: Record<string, string> = { baby: "새끼", teen: "청소년", adult: "어른" };
  const FREQ_KO: Record<string, string> = { often: "자주", sometimes: "가끔", manual: "수동만" };
  const [stage, setStage] = useState<string>(d.pet.stage);
  const [name, setName] = useState("");
  const [freq, setFreq] = useState("sometimes");
  const [line, setLine] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [replayKey, setReplayKey] = useState<Record<number, number>>({});

  async function add() {
    if (!file || !name.trim()) return setMsg("이미지와 이름을 넣으세요.");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("stage", stage);
    fd.append("name", name.trim());
    fd.append("frequency", freq);
    fd.append("line", line.trim());
    const res = await fetch(`/api/pets/${d.pet.id}/custom-sprites`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? (j.warning ?? "추가됨") : (j.error ?? "실패"));
    if (res.ok) {
      setName("");
      setLine("");
      setFile(null);
      reload();
      onChanged();
    }
  }
  async function del(id: number) {
    await fetch(`/api/pets/${d.pet.id}/custom-sprites`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customId: id }),
    });
    reload();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] opacity-50">
        커스텀 모션 — 표시 스테이지와 같을 때 가끔 자동 재생돼요. 수치·상태와 무관. (탭해서 수동 재생)
      </p>
      <ul className="flex flex-col gap-1.5">
        {d.customSprites.length === 0 && <li className="text-[11px] opacity-40">아직 커스텀 모션이 없어요.</li>}
        {d.customSprites.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-control bg-bg p-2 ring-1 ring-border">
            <button
              type="button"
              onClick={() => setReplayKey((k) => ({ ...k, [c.id]: (k[c.id] ?? 0) + 1 }))}
              title="수동 재생"
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${c.path}?r=${replayKey[c.id] ?? 0}`} alt={c.name} className="h-12 w-12 object-contain" />
            </button>
            <div className="min-w-0 flex-1 text-xs">
              <div className="truncate">{c.name}</div>
              <div className="opacity-50">
                {STAGES_KO[c.stage] ?? c.stage} · {FREQ_KO[c.frequency] ?? c.frequency}
                {c.line ? ` · "${c.line}"` : ""}
              </div>
            </div>
            <button onClick={() => del(c.id)} className="shrink-0 px-1 text-xs opacity-40 hover:text-red-400">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <label className="cursor-pointer rounded-control bg-bg px-3 py-2 text-center text-xs ring-1 ring-border">
          {file ? file.name : "모션 이미지 선택 (GIF/WebP/PNG)"}
          <input
            type="file"
            accept="image/gif,image/webp,image/png"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="모션 이름" className={input} />
        <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={40} placeholder="함께 표시할 대사(선택)" className={input} />
        <div className="flex gap-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)} className={input}>
            {d.pet.reachedStages.map((s) => (
              <option key={s} value={s}>
                {STAGES_KO[s] ?? s}
              </option>
            ))}
          </select>
          <select value={freq} onChange={(e) => setFreq(e.target.value)} className={input}>
            <option value="often">자주</option>
            <option value="sometimes">가끔</option>
            <option value="manual">수동만</option>
          </select>
        </div>
        {msg && <p className="text-[11px] text-accent">{msg}</p>}
        <button onClick={add} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">추가</button>
      </div>
    </div>
  );
}

function LinesTab({ d, allPets, reload, onChanged }: { d: Detail; allPets: PetRef[]; reload: () => void; onChanged: () => void }) {
  const [stage, setStage] = useState<string>(d.pet.stage);
  const [content, setContent] = useState("");
  const [about, setAbout] = useState<number | null>(null);
  const others = allPets.filter((p) => p.id !== d.pet.id);
  const list = d.lines.filter((l) => l.stage === stage);

  async function add() {
    if (!content.trim()) return;
    await fetch(`/api/pets/${d.pet.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, content: content.trim(), aboutPetId: about }),
    });
    setContent("");
    reload();
    onChanged();
  }
  async function del(id: number) {
    await fetch(`/api/pets/${d.pet.id}/lines`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lineId: id }),
    });
    reload();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 text-xs">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setStage(s)} className={`rounded-control px-3 py-1 ${stage === s ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}>
            {STAGE_KO[s]}
          </button>
        ))}
      </div>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {list.length === 0 && <li className="text-[11px] opacity-40">아직 대사가 없어요(없으면 기본 대사로 동작).</li>}
        {list.map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            <span className="truncate">{l.content}</span>
            <span className="shrink-0 text-[10px] opacity-40">{l.kind === "about_other" ? "관계" : l.source === "manual" ? "직접" : "auto"}</span>
            <button onClick={() => del(l.id)} className="ml-auto shrink-0 px-1 text-xs opacity-30 hover:text-red-400">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 border-t border-border pt-2">
        <input value={content} onChange={(e) => setContent(e.target.value)} maxLength={60} placeholder="직접 추가할 대사" className={input} />
        <div className="flex gap-2">
          <select value={about ?? ""} onChange={(e) => setAbout(e.target.value ? Number(e.target.value) : null)} className={input}>
            <option value="">혼잣말(solo)</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}에 대해
              </option>
            ))}
          </select>
          <button onClick={add} className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">추가</button>
        </div>
      </div>
    </div>
  );
}

function RelationsTab({ d, allPets, reload, onChanged }: { d: Detail; allPets: PetRef[]; reload: () => void; onChanged: () => void }) {
  const others = allPets.filter((p) => p.id !== d.pet.id);
  const nameOf = (id: number) => allPets.find((p) => p.id === id)?.name ?? "?";
  const [other, setOther] = useState<number | null>(others[0]?.id ?? null);
  const [label, setLabel] = useState("");

  async function save() {
    if (other == null || !label.trim()) return;
    await fetch("/api/pet-relations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ petA: d.pet.id, petB: other, label: label.trim() }),
    });
    setLabel("");
    reload();
    onChanged();
  }
  async function del(petAId: number, petBId: number) {
    const otherId = petAId === d.pet.id ? petBId : petAId;
    await fetch("/api/pet-relations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ petA: d.pet.id, petB: otherId }),
    });
    reload();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] opacity-50">관계는 네가 정하는 설정이야. 라이벌·연인·단짝 등 자유롭게.</p>
      <ul className="flex flex-col gap-1">
        {d.relations.length === 0 && <li className="text-[11px] opacity-40">아직 관계가 없어요.</li>}
        {d.relations.map((r) => {
          const otherId = r.petAId === d.pet.id ? r.petBId : r.petAId;
          return (
            <li key={`${r.petAId}-${r.petBId}`} className="flex items-center gap-2 text-sm">
              <span>{nameOf(otherId)}</span>
              <span className="text-accent">· {r.relationLabel}</span>
              <button onClick={() => del(r.petAId, r.petBId)} className="ml-auto px-1 text-xs opacity-30 hover:text-red-400">✕</button>
            </li>
          );
        })}
      </ul>
      {others.length === 0 ? (
        <p className="text-[11px] opacity-40">다른 펫이 있어야 관계를 만들 수 있어요.</p>
      ) : (
        <div className="flex gap-2 border-t border-border pt-2">
          <select value={other ?? ""} onChange={(e) => setOther(Number(e.target.value))} className={input}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="관계(예: 연인)" className={input} />
          <button onClick={save} className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-black">저장</button>
        </div>
      )}
    </div>
  );
}
