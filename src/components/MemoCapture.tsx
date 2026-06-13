"use client";

import { useState } from "react";
import Link from "next/link";

export interface MemoPreview {
  id: number;
  content: string;
}

// 홈 컴팩트 캡처 박스 — 입력칸 1개 + 최근 미완료 2~3개 미리보기. 카운트 뱃지·강조 없음(중립).
export default function MemoCapture({ initial }: { initial: MemoPreview[] }) {
  const [recent, setRecent] = useState<MemoPreview[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setText("");
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const d = await res.json();
        setRecent((r) => [{ id: d.memo.id, content: d.memo.content }, ...r].slice(0, 3));
      } else {
        setText(content);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">주머니</h2>
        <Link href="/memos" className="text-[11px] text-accent">열기</Link>
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="떠오른 걸 담아둬요"
          className="w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
        />
        <button
          onClick={add}
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          담기
        </button>
      </div>
      {recent.length > 0 && (
        <Link href="/memos" className="mt-2 flex flex-col gap-0.5">
          {recent.slice(0, 3).map((m) => (
            <span key={m.id} className="truncate text-xs opacity-60">
              · {m.content}
            </span>
          ))}
        </Link>
      )}
    </section>
  );
}
