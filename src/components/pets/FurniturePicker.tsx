"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type FurnItem = {
  id: number;
  name: string;
  spritePath: string;
  pixelRender: boolean;
  furnitureKind: "seat" | "fixture" | null;
  durabilityMax?: number | null;
};

// 전역 라이브러리(kind=furniture|item)에서 골라 이 방에 배치. 모양·종류 편집은 관리 화면에서.
export default function FurniturePicker({
  roomId,
  kind = "furniture",
  posX,
  onClose,
  onPlaced,
}: {
  roomId: number;
  kind?: "furniture" | "item";
  posX?: number; // 현재 보는 패널 중앙(미전달 시 방 가운데)
  onClose: () => void;
  onPlaced: () => void;
}) {
  const isFurn = kind === "furniture";
  const [items, setItems] = useState<FurnItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/pets/items?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setMsg("불러오지 못했어요."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function place(it: FurnItem) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/pet-rooms/${roomId}/placements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: it.id, ...(posX != null ? { posX, posY: 60 } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(data.error ?? "배치 실패");
      onPlaced();
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">{isFurn ? "가구 배치" : "아이템 배치"}</h2>
          <Link href="/pets/manage?tab=items" className="text-[11px] text-accent">
            + 새 {isFurn ? "가구" : "아이템"} 등록(관리)
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="py-8 text-center text-xs opacity-50">
            등록된 {isFurn ? "가구" : "아이템"}이 없어요. ‘관리 → 아이템·가구’에서 먼저 추가하세요.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => place(it)}
                  disabled={busy}
                  className="flex w-full flex-col items-center gap-1 rounded-card bg-surface-2 p-2 ring-1 ring-border disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.spritePath}
                    alt=""
                    className="h-14 w-14 object-contain"
                    style={{ objectPosition: "bottom", imageRendering: it.pixelRender ? "pixelated" : "auto" }}
                  />
                  <span className="max-w-full truncate text-[11px]">{it.name}</span>
                  <span className="text-[9px] text-text-dim">
                    {isFurn ? (it.furnitureKind === "seat" ? "의자" : "설치물") : it.durabilityMax != null ? `내구 ${it.durabilityMax}` : "아이템"}
                  </span>
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
