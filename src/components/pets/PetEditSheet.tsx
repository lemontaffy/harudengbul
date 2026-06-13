"use client";

import { useEffect, useState, useCallback } from "react";
import { useDialog } from "@/components/ui/Dialog";
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
  };
  sprites: { stage: string; kind: string; path: string }[];
  lines: { id: number; stage: string; kind: string; aboutPetId: number | null; content: string; source: string }[];
  relations: { petAId: number; petBId: number; relationLabel: string }[];
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
  const [tab, setTab] = useState<"info" | "sprites" | "lines" | "relations">("info");

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
            <div className="mb-3 flex gap-2 text-xs">
              {(["info", "sprites", "lines", "relations"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-control px-3 py-1.5 ${tab === t ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}
                >
                  {{ info: "정보", sprites: "모습", lines: "대사", relations: "관계" }[t]}
                </button>
              ))}
            </div>
            {tab === "info" && <InfoTab d={d} rooms={rooms} onChanged={onChanged} reload={load} />}
            {tab === "sprites" && <SpritesTab d={d} reload={load} onChanged={onChanged} />}
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

function InfoTab({ d, rooms, onChanged, reload }: { d: Detail; rooms: PetRef[]; onChanged: () => void; reload: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(d.pet.name);
  const [personality, setPersonality] = useState(d.pet.personality ?? "");
  const [pixel, setPixel] = useState(d.pet.pixelRender);
  const [roomId, setRoomId] = useState(d.pet.roomId);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/pets/${d.pet.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, personality: personality.trim() || null, pixelRender: pixel, roomId }),
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
