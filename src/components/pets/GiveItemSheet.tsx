"use client";

import { useEffect, useRef, useState } from "react";

export interface GiveResult {
  kind: "received" | "owner_recognize" | "other_owner" | "repeat";
  content: string;
  effect: "sparkle" | "notes" | "hearts" | null;
  ownerCall: { ownerPetId: number; content: string } | null;
}

type ItemRow = {
  id: number;
  name: string;
  spritePath: string;
  pixelRender: boolean;
  ownerPetId: number | null;
};
type PetOpt = { id: number; name: string };
type EditLine = { id: number; kind: string; content: string; source: string };

const KIND_LABEL: Record<string, string> = {
  received: "받음",
  owner_recognize: "주인 인식",
  other_owner: "주인 언급",
};

// 아이템 '주기' 시트 — 받는 펫 + 전역 아이템(kind=item) 선택 → 반응 재생. 반응 풀 편집(열람/추가/삭제) 포함.
export default function GiveItemSheet({
  pets,
  ownerNames,
  onClose,
  onGiven,
}: {
  pets: PetOpt[];
  ownerNames: Map<number, string>;
  onClose: () => void;
  onGiven: (petId: number, result: GiveResult, item: { spritePath: string; pixelRender: boolean }) => void;
}) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [petId, setPetId] = useState<number | null>(pets[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editItem, setEditItem] = useState<number | null>(null);

  useEffect(() => {
    const roomPetIds = new Set(pets.map((p) => p.id));
    fetch("/api/pets/items?kind=item")
      .then((r) => r.json())
      .then((d) => {
        const list: ItemRow[] = d.items ?? [];
        // 정렬: 이 방 펫이 주인인 아이템 우선 → 나머지(이름순 안정).
        list.sort((a, b) => {
          const ao = a.ownerPetId != null && roomPetIds.has(a.ownerPetId) ? 0 : 1;
          const bo = b.ownerPetId != null && roomPetIds.has(b.ownerPetId) ? 0 : 1;
          return ao - bo || a.name.localeCompare(b.name);
        });
        setItems(list);
      })
      .catch(() => setMsg("아이템을 못 불러왔어요."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function give(item: ItemRow) {
    if (petId == null) return setMsg("받는 펫을 고르세요.");
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/pets/items/${item.id}/give`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ petId }),
      });
      const data = (await res.json().catch(() => ({}))) as GiveResult & { error?: string };
      if (!res.ok) return setMsg(data.error ?? "주기 실패");
      onGiven(petId, data, { spritePath: item.spritePath, pixelRender: item.pixelRender });
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
        <h2 className="mb-3 font-display text-sm font-semibold">아이템 주기</h2>

        {/* 받는 펫 */}
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

        {items.length === 0 ? (
          <p className="py-8 text-center text-xs opacity-50">
            줄 아이템이 없어요. ‘관리 → 아이템·가구’에서 아이템을 추가하세요.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col items-center gap-1 rounded-card bg-surface-2 p-2 ring-1 ring-border">
                <button onClick={() => give(it)} disabled={busy} className="flex flex-col items-center gap-1 disabled:opacity-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.spritePath}
                    alt=""
                    className="h-12 w-12 object-contain"
                    style={{ imageRendering: it.pixelRender ? "pixelated" : "auto" }}
                  />
                  <span className="max-w-full truncate text-[11px]">{it.name}</span>
                  {it.ownerPetId != null && (
                    <span className="text-[9px] text-text-dim">{ownerNames.get(it.ownerPetId) ?? "주인"} 것</span>
                  )}
                </button>
                <button
                  onClick={() => setEditItem((v) => (v === it.id ? null : it.id))}
                  className="text-[9px] text-text-dim underline-offset-2 hover:underline"
                >
                  반응 편집
                </button>
                {editItem === it.id && petId != null && (
                  <ReactionEditor itemId={it.id} petId={petId} />
                )}
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

// 반응 풀 편집 — 이 (아이템×선택펫)의 대사 열람·삭제·직접 추가. aux 생성분(auto)·수동(manual) 함께.
function ReactionEditor({ itemId, petId }: { itemId: number; petId: number }) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [kind, setKind] = useState("received");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const d = await fetch(`/api/pets/items/${itemId}/reactions?petId=${petId}`).then((r) => r.json()).catch(() => ({}));
    setLines(d.lines ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, petId]);

  async function add() {
    const content = inputRef.current?.value.trim();
    if (!content) return;
    const res = await fetch(`/api/pets/items/${itemId}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ petId, kind, content }),
    });
    if (res.ok) {
      if (inputRef.current) inputRef.current.value = "";
      load();
    }
  }
  async function del(id: number) {
    await fetch(`/api/pets/items/${itemId}/reactions?lineId=${id}`, { method: "DELETE" }).catch(() => {});
    setLines((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <div className="mt-1 w-full rounded-control bg-bg p-2 text-left">
      {lines.length === 0 ? (
        <p className="text-[10px] text-text-dim">아직 캐시된 반응이 없어요(처음 주면 생성).</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-1 text-[10px]">
              <span className="shrink-0 rounded bg-surface-2 px-1 text-[8px] text-text-dim">{KIND_LABEL[l.kind] ?? l.kind}</span>
              <span className="min-w-0 flex-1 truncate">{l.content}</span>
              <button onClick={() => del(l.id)} className="shrink-0 px-1 text-text-dim hover:text-danger">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex items-center gap-1">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded bg-surface-2 px-1 py-0.5 text-[10px] ring-1 ring-border">
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input ref={inputRef} maxLength={40} placeholder="대사 추가" className="min-w-0 flex-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] outline-none ring-1 ring-border" />
        <button onClick={add} className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-black">+</button>
      </div>
    </div>
  );
}
