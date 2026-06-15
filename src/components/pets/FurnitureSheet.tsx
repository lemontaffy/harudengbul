"use client";

import { useState } from "react";
import { useDialog } from "@/components/ui/Dialog";
import type { FurnitureVM } from "./types";

const ACTIONS: { v: string; ko: string }[] = [
  { v: "letters", ko: "편지" },
  { v: "memo", ko: "메모" },
  { v: "diary", ko: "일기" },
  { v: "pet_diary", ko: "펫 일기장" },
  { v: "achievements", ko: "업적판" },
  { v: "none", ko: "장식" },
];
// 상태(알림 스프라이트)를 가지는 액션 — 편지(도착/읽음), 펫 일기장(오늘 안 들여다봄).
const hasState = (a: string) => a === "letters" || a === "pet_diary";
const ACCEPT = "image/gif,image/webp,image/png,image/jpeg";
const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// 가구 편집 시트 — 배치된 가구의 모양·종류(라이브러리 원본 item)와 위치 변형(placement)을 편집.
//   추가는 FurniturePicker(라이브러리에서 골라 배치)가 담당. 이 시트는 편집 전용.
export default function FurnitureSheet({
  furniture,
  onClose,
  onSaved,
  onDeleted,
}: {
  furniture: FurnitureVM; // 편집 대상(id=placementId, itemId=라이브러리 원본)
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (placementId: number) => void;
}) {
  const dialog = useDialog();
  const [kind, setKind] = useState<"seat" | "fixture">(furniture.kind);
  const [type, setType] = useState(furniture.type ?? "");
  const [action, setAction] = useState(furniture.actionType ?? "letters");
  const [facing, setFacing] = useState<"left" | "right">(furniture.facing);
  const [seatY, setSeatY] = useState(furniture.seatY);
  const [scale, setScale] = useState(furniture.scale);
  const [rotation, setRotation] = useState(furniture.rotation);
  const [file, setFile] = useState<File | null>(null);
  const [altFile, setAltFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const showAlt = kind === "fixture" && hasState(action); // 알림 스프라이트 받을지

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      // 모양·종류 = 라이브러리 원본 item(여러 방 배치에 공유 반영).
      const metaRes = await fetch(`/api/pets/items/${furniture.itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          furnitureKind: kind,
          type: type.trim() || undefined,
          ...(kind === "fixture" ? { actionType: action } : {}),
          ...(kind === "seat" ? { facing, seatY: Math.round(seatY) } : {}),
        }),
      });
      if (!metaRes.ok) return setMsg((await metaRes.json().catch(() => ({})))?.error ?? "저장 실패");
      // 위치 변형(크기·회전) = 이 배치(placement)만.
      const trRes = await fetch(`/api/placements/${furniture.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scale: Math.round(scale * 100) / 100, rotation: Math.round(rotation) }),
      });
      if (!trRes.ok) return setMsg("저장 실패");
      // 스프라이트 교체(올린 것만) — 라이브러리 원본에 반영.
      if (file) await replaceSprite("main", file);
      if (altFile) await replaceSprite("alt", altFile);
      onSaved();
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }
  async function replaceSprite(slot: "main" | "alt", f: File) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("slot", slot);
    await fetch(`/api/pets/items/${furniture.itemId}/sprite`, { method: "POST", body: fd });
  }
  async function del() {
    if (!(await dialog.confirm({ message: `'${furniture.type}'을(를) 이 방에서 뺄까요? 앉아있던 펫은 일어나요. (라이브러리 원본은 남아요)`, danger: true, confirmText: "방에서 빼기" }))) return;
    setBusy(true);
    await fetch(`/api/placements/${furniture.id}`, { method: "DELETE" });
    onDeleted(furniture.id);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-card bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-3 font-display text-sm font-semibold">가구 편집</h2>
        <div className="flex flex-col gap-3 text-sm">
          {/* 유형 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">유형</span>
            {(["seat", "fixture"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-control px-3 py-1 text-xs ring-1 ring-border ${kind === k ? "bg-accent text-black" : "bg-bg"}`}
              >
                {k === "seat" ? "앉는 가구" : "기능 가구"}
              </button>
            ))}
          </div>
          {/* fixture 액션 */}
          {kind === "fixture" && (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs opacity-60">기능</span>
              <select value={action} onChange={(e) => setAction(e.target.value)} className={input}>
                {ACTIONS.map((a) => (
                  <option key={a.v} value={a.v}>
                    {a.ko}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* seat: 앉은 펫 방향 + 좌석면 높이 */}
          {kind === "seat" && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs opacity-60">방향</span>
                {(["left", "right"] as const).map((fc) => (
                  <button
                    key={fc}
                    onClick={() => setFacing(fc)}
                    className={`rounded-control px-3 py-1 text-xs ring-1 ring-border ${facing === fc ? "bg-accent text-black" : "bg-bg"}`}
                  >
                    {fc === "left" ? "← 왼쪽" : "오른쪽 →"}
                  </button>
                ))}
                <span className="text-[10px] opacity-40">앉으면 펫이 볼 쪽</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs opacity-60">좌석높이</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={seatY}
                  onChange={(e) => setSeatY(Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="w-8 shrink-0 text-right text-xs opacity-60">{Math.round(seatY)}</span>
              </div>
              <p className="text-[10px] opacity-40">좌석면 높이(0=위, 100=아래) — 펫 엉덩이가 닿을 선. 떠 보이면 ↓, 파묻히면 ↑.</p>
            </>
          )}
          {/* 위치 변형(이 배치만) — 크기·회전 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">크기</span>
            <input type="range" min={0.3} max={3} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="flex-1 accent-accent" />
            <span className="w-10 shrink-0 text-right text-xs opacity-60">{scale.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">회전</span>
            <input type="range" min={-180} max={180} step={5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="flex-1 accent-accent" />
            <span className="w-10 shrink-0 text-right text-xs opacity-60">{Math.round(rotation)}°</span>
            <button onClick={() => setRotation(0)} className="shrink-0 rounded-control px-2 py-0.5 text-[10px] ring-1 ring-border">0°</button>
          </div>
          {/* 라벨 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">이름</span>
            <input value={type} onChange={(e) => setType(e.target.value)} maxLength={20} placeholder="예: 벤치, 쿠션, 우체통" className={input} />
          </div>
          {/* 스프라이트(기본) */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">교체</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={furniture.spritePath} alt="" className="h-10 w-10 rounded bg-bg object-contain" style={{ objectPosition: "bottom" }} />
            <label className="cursor-pointer rounded-control bg-bg px-3 py-2 text-xs ring-1 ring-border">
              {file ? file.name.slice(0, 16) : "기본 교체"}
              <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {/* 알림 스프라이트(편지 등 상태 있는 fixture) */}
          {showAlt && (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs opacity-60">알림</span>
              {furniture.spriteAltPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={furniture.spriteAltPath} alt="" className="h-10 w-10 rounded bg-bg object-contain" style={{ objectPosition: "bottom" }} />
              )}
              <label className="cursor-pointer rounded-control bg-bg px-3 py-2 text-xs ring-1 ring-border">
                {altFile ? altFile.name.slice(0, 16) : "알림(열림) 스프라이트"}
                <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setAltFile(e.target.files?.[0] ?? null)} />
              </label>
              <span className="text-[10px] opacity-40">안 읽은 편지 있을 때</span>
            </div>
          )}

          {msg && <p className="text-[11px] text-accent">{msg}</p>}

          <div className="mt-1 flex items-center gap-2">
            <button onClick={save} disabled={busy} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
              {busy ? "저장 중…" : "저장"}
            </button>
            <button onClick={onClose} className="rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border">
              취소
            </button>
            <button onClick={del} disabled={busy} className="ml-auto rounded-control px-3 py-2 text-xs text-red-400 ring-1 ring-border">
              방에서 빼기
            </button>
          </div>
          <p className="text-[10px] opacity-40">모양·종류는 라이브러리 원본을 바꿔 다른 방의 같은 가구에도 반영돼요. 크기·회전은 이 배치만.</p>
          <p className="text-[10px] opacity-40">
            앉는 가구 = 펫이 다가가 앉아요(펫에 ‘앉기’ 스프라이트 필요). 기능 가구 = 탭하면 그 화면이 열려요.
          </p>
        </div>
      </div>
    </div>
  );
}
