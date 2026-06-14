"use client";

import { useState } from "react";

export interface AchievementSuggestion {
  id: number;
  suggestedText: string;
  personaName: string | null;
}

const inputCls = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

// pending 업적 후보 카드(노라가 짚어준 '해낸 일'). 평가·독촉 없이 담백하게.
export default function AchievementCard({ initial }: { initial: AchievementSuggestion[] }) {
  const [items, setItems] = useState<AchievementSuggestion[]>(initial);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) return null;
  const who = items[0]?.personaName?.trim() || "상담가";

  function remove(id: number) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    if (editId === id) setEditId(null);
  }

  async function register(it: AchievementSuggestion, title: string) {
    if (!title.trim()) return;
    setBusyId(it.id);
    const res = await fetch(`/api/achievement-suggestions/${it.id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    setBusyId(null);
    if (res.ok || res.status === 409) remove(it.id);
  }
  async function dismiss(id: number) {
    setBusyId(id);
    const res = await fetch(`/api/achievement-suggestions/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok || res.status === 409) remove(id);
  }

  return (
    <section className="rounded-card bg-surface p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm">
          <span className="font-medium">{who}</span>가 남긴 업적{" "}
          <span className="text-accent">{items.length}건</span>
        </span>
        <span className="text-xs opacity-40">{open ? "접기" : "보기"}</span>
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-bg p-3 ring-1 ring-border">
              {editId === it.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={200}
                    className={inputCls}
                  />
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => register(it, draft)}
                      disabled={busyId === it.id}
                      className="rounded-control bg-accent px-3 py-1.5 font-medium text-black disabled:opacity-50"
                    >
                      업적판에 등록
                    </button>
                    <button onClick={() => setEditId(null)} className="rounded-control px-3 py-1.5 opacity-60 ring-1 ring-border">
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm">{it.suggestedText}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <button
                      onClick={() => register(it, it.suggestedText)}
                      disabled={busyId === it.id}
                      className="rounded-control bg-accent px-3 py-1.5 font-medium text-black disabled:opacity-50"
                    >
                      업적판에 등록
                    </button>
                    <button
                      onClick={() => {
                        setEditId(it.id);
                        setDraft(it.suggestedText);
                      }}
                      className="rounded-control bg-surface px-3 py-1.5 ring-1 ring-border"
                    >
                      수정 후 등록
                    </button>
                    <button onClick={() => dismiss(it.id)} className="rounded-control px-3 py-1.5 opacity-60 hover:text-red-400">
                      넘기기
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
