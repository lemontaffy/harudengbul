"use client";

import { useState } from "react";
import type { ItemVM } from "./types";

export interface GiveResult {
  kind: "received" | "owner_recognize" | "other_owner" | "repeat";
  content: string;
  effect: "sparkle" | "notes" | "hearts" | null;
  ownerCall: { ownerPetId: number; content: string } | null;
  durabilityNow: number | null;
  broke: boolean;
}

type PetOpt = { id: number; name: string };

// v6 방 바구니 — 이 방의 아이템 인스턴스(placed=false). throw=펫에게 던지기(반응+내구도), place=방에 놓기.
export default function GiveItemSheet({
  roomId,
  mode,
  basket,
  pets,
  ownerNames,
  posX,
  onClose,
  onThrew,
  onChanged,
}: {
  roomId: number;
  mode: "throw" | "place";
  basket: ItemVM[];
  pets: PetOpt[];
  ownerNames: Map<number, string>;
  posX?: number;
  onClose: () => void;
  onThrew: (petId: number, result: GiveResult, item: { spritePath: string; pixelRender: boolean }) => void;
  onChanged: () => void;
}) {
  const isThrow = mode === "throw";
  const [petId, setPetId] = useState<number | null>(pets[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 정렬: 이 방 펫이 주인인 아이템 우선.
  const roomPetIds = new Set(pets.map((p) => p.id));
  const sorted = [...basket].sort((a, b) => {
    const ao = a.ownerPetId != null && roomPetIds.has(a.ownerPetId) ? 0 : 1;
    const bo = b.ownerPetId != null && roomPetIds.has(b.ownerPetId) ? 0 : 1;
    return ao - bo || a.name.localeCompare(b.name);
  });

  async function throwTo(it: ItemVM) {
    if (petId == null) return setMsg("받는 펫을 고르세요.");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/room-items/${it.id}/give`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ petId }),
      });
      const data = (await res.json().catch(() => ({}))) as GiveResult & { error?: string };
      if (!res.ok) return setMsg(data.error ?? "주기 실패");
      onThrew(petId, data, { spritePath: it.spritePath, pixelRender: it.pixelRender });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function place(it: ItemVM) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/room-items/${it.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placed: true, posX: posX ?? 50, posY: 72 }),
      });
      if (!res.ok) return setMsg("배치 실패");
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-md overflow-y-auto rounded-t-card bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-3 font-display text-sm font-semibold">{isThrow ? "아이템 주기" : "바구니 → 방에 놓기"}</h2>

        {isThrow && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-60">받는 펫</span>
            {pets.map((p) => (
              <button
                key={p.id}
                onClick={() => setPetId(p.id)}
                className={`rounded-control px-3 py-1 text-xs ring-1 ring-border ${petId === p.id ? "bg-accent text-black" : "bg-bg"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-xs opacity-50">
            바구니가 비었어요. {isThrow ? "관리 모드에서 ‘풀에서 꺼내기’로 아이템을 담거나, 배치된 아이템을 ‘내림’ 하세요." : "‘풀에서 꺼내기’로 아이템을 담으세요."}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {sorted.map((it) => (
              <li key={it.id} className="flex flex-col items-center gap-1 rounded-card bg-surface-2 p-2 ring-1 ring-border">
                <button onClick={() => (isThrow ? throwTo(it) : place(it))} disabled={busy} className="flex flex-col items-center gap-1 disabled:opacity-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.brokenSpritePath && it.broken ? it.brokenSpritePath : it.spritePath}
                    alt=""
                    className="h-12 w-12 object-contain"
                    style={{ imageRendering: it.pixelRender ? "pixelated" : "auto", filter: it.broken && !it.brokenSpritePath ? "grayscale(0.5)" : undefined }}
                  />
                  <span className="max-w-full truncate text-[11px]">{it.name}</span>
                  {it.ownerPetId != null && (
                    <span className="text-[9px] text-text-dim">{ownerNames.get(it.ownerPetId) ?? "주인"} 것</span>
                  )}
                  {it.durabilityMax != null && (
                    <span className="text-[9px] text-text-dim">{it.broken ? "파손" : `${it.durabilityNow}/${it.durabilityMax}`}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {msg && <p className="mt-2 text-[11px] text-accent">{msg}</p>}
        <button onClick={onClose} className="mt-3 w-full rounded-control px-4 py-2 text-sm opacity-60 ring-1 ring-border">
          닫기
        </button>
      </div>
    </div>
  );
}
