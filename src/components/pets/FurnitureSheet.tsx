"use client";

import { useState } from "react";
import { useDialog } from "@/components/ui/Dialog";
import type { FurnitureVM } from "./types";

const ACTIONS: { v: string; ko: string }[] = [
  { v: "letters", ko: "편지" },
  { v: "memo", ko: "메모" },
  { v: "diary", ko: "일기" },
  { v: "none", ko: "장식" },
];
// 상태(알림 스프라이트)를 가지는 액션 — 편지만 도착/읽음 상태가 있음.
const hasState = (a: string) => a === "letters";
const ACCEPT = "image/gif,image/webp,image/png,image/jpeg";
const input = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// 가구 추가/편집 시트 — 펫 편집 시트와 동일한 바텀시트 패턴.
export default function FurnitureSheet({
  roomId,
  furniture,
  onClose,
  onSaved,
  onDeleted,
}: {
  roomId: number;
  furniture: FurnitureVM | null; // null = 추가 모드
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (id: number) => void;
}) {
  const editing = !!furniture;
  const dialog = useDialog();
  const [kind, setKind] = useState<"seat" | "fixture">(furniture?.kind ?? "seat");
  const [type, setType] = useState(furniture?.type ?? "");
  const [action, setAction] = useState(furniture?.actionType ?? "letters");
  const [file, setFile] = useState<File | null>(null);
  const [altFile, setAltFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const showAlt = kind === "fixture" && hasState(action); // 알림 스프라이트 받을지

  async function save() {
    if (!editing && !file) return setMsg("스프라이트를 올려주세요.");
    setBusy(true);
    setMsg("");
    try {
      if (!editing) {
        const fd = new FormData();
        fd.append("file", file!);
        fd.append("kind", kind);
        if (type.trim()) fd.append("type", type.trim());
        if (kind === "fixture") fd.append("actionType", action);
        if (showAlt && altFile) fd.append("altFile", altFile);
        const res = await fetch(`/api/pet-rooms/${roomId}/furniture`, { method: "POST", body: fd });
        if (!res.ok) return setMsg((await res.json().catch(() => ({})))?.error ?? "추가 실패");
      } else {
        // 메타(유형·라벨·액션)
        const res = await fetch(`/api/furniture/${furniture!.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, type: type.trim() || undefined, actionType: kind === "fixture" ? action : null }),
        });
        if (!res.ok) return setMsg((await res.json().catch(() => ({})))?.error ?? "저장 실패");
        // 스프라이트 교체(올린 것만)
        if (file) await replaceSprite(furniture!.id, "main", file);
        if (altFile) await replaceSprite(furniture!.id, "alt", altFile);
      }
      onSaved();
    } catch {
      setMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }
  async function replaceSprite(id: number, slot: "main" | "alt", f: File) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("slot", slot);
    await fetch(`/api/furniture/${id}/sprite`, { method: "POST", body: fd });
  }
  async function del() {
    if (!furniture) return;
    if (!(await dialog.confirm({ message: `'${furniture.type}' 가구를 삭제할까요? 앉아있던 펫은 일어나요.`, danger: true, confirmText: "삭제" }))) return;
    setBusy(true);
    await fetch(`/api/furniture/${furniture.id}`, { method: "DELETE" });
    onDeleted(furniture.id);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-card bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-3 font-display text-sm font-semibold">{editing ? "가구 편집" : "가구 추가"}</h2>
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
          {/* 라벨 */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">이름</span>
            <input value={type} onChange={(e) => setType(e.target.value)} maxLength={20} placeholder="예: 벤치, 쿠션, 우체통" className={input} />
          </div>
          {/* 스프라이트(기본) */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs opacity-60">{editing ? "교체" : "그림"}</span>
            {editing && furniture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={furniture.spritePath} alt="" className="h-10 w-10 rounded bg-bg object-contain" style={{ objectPosition: "bottom" }} />
            )}
            <label className="cursor-pointer rounded-control bg-bg px-3 py-2 text-xs ring-1 ring-border">
              {file ? file.name.slice(0, 16) : editing ? "기본 교체" : "기본 스프라이트"}
              <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {/* 알림 스프라이트(편지 등 상태 있는 fixture) */}
          {showAlt && (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs opacity-60">알림</span>
              {editing && furniture?.spriteAltPath && (
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
            {editing && (
              <button onClick={del} disabled={busy} className="ml-auto rounded-control px-3 py-2 text-xs text-red-400 ring-1 ring-border">
                삭제
              </button>
            )}
          </div>
          <p className="text-[10px] opacity-40">
            앉는 가구 = 펫이 다가가 앉아요(펫에 ‘앉기’ 스프라이트 필요). 기능 가구 = 탭하면 그 화면이 열려요.
          </p>
        </div>
      </div>
    </div>
  );
}
