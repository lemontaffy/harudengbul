"use client";

import { useState } from "react";
import { useDialog } from "@/components/ui/Dialog";

type Card = { id: number; body: string };

export default function PocketCards({ initial }: { initial: Card[] }) {
  const dialog = useDialog();
  const [cards, setCards] = useState<Card[]>(initial);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pocket/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const { card } = await res.json();
        setCards((c) => [card, ...c]);
        setText("");
        setAdding(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    if (!(await dialog.confirm({ message: "이 카드를 지울까요?", danger: true, confirmText: "지우기" }))) return;
    await fetch(`/api/pocket/cards?id=${id}`, { method: "DELETE" });
    setCards((c) => c.filter((x) => x.id !== id));
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold">괜찮은 날의 내가 남긴 말</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] text-accent"
        >
          {adding ? "닫기" : "+ 카드 쓰기"}
        </button>
      </div>

      {adding && (
        <div className="mb-3 rounded-card bg-surface p-4">
          <p className="mb-2 text-[11px] opacity-50">
            지금 괜찮은 너가, 무너진 날의 너에게. 짧아도 괜찮아.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="예: 이건 지나가. 너는 생각보다 잘 버텨왔어."
            className="w-full resize-none rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
          />
          <button
            onClick={add}
            disabled={busy || !text.trim()}
            className="mt-2 rounded-control bg-accent px-4 py-1.5 text-xs font-medium text-black disabled:opacity-50"
          >
            저장
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-sm leading-relaxed opacity-50">
          아직 적어둔 카드가 없어요. 마음이 괜찮은 날, 무너질 너에게 한 줄 남겨두면
          그날의 네가 큰 힘이 돼요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((c) => (
            <li
              key={c.id}
              className="group flex items-start gap-2 rounded-card bg-gradient-to-br from-[#2a2531] to-[#23212c] p-4 ring-1 ring-accent"
            >
              <span className="mt-0.5 shrink-0 text-accent">“</span>
              <p className="flex-1 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#ece4d8]">
                {c.body}
              </p>
              <button
                onClick={() => del(c.id)}
                className="shrink-0 text-[11px] opacity-0 transition group-hover:opacity-50 hover:!opacity-100 hover:text-red-400"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
