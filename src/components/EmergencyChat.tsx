"use client";

import { useState } from "react";

type Msg = { role: "user" | "counselor"; content: string };

export default function EmergencyChat({ counselorName }: { counselorName: string }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  function append(chunk: string) {
    setMsgs((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last && last.role === "counselor") {
        c[c.length - 1] = { ...last, content: last.content + chunk };
      }
      return c;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "counselor", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/pocket/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        append(d.error ?? "응답을 가져오지 못했어요.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(dec.decode(value, { stream: true }));
      }
    } catch {
      append("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-5">
      <h2 className="text-sm font-semibold">지금 많이 힘들면</h2>
      <p className="mb-3 text-[11px] opacity-50">
        무슨 일이 있었는지 한 줄만 적어도 돼요. {counselorName}이(가) 곁에 있어요.
      </p>

      {msgs.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {msgs.map((m, i) => {
            const mine = m.role === "user";
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-accent text-black" : "bg-bg ring-1 ring-white/10"
                  }`}
                >
                  {m.content || (busy && !mine ? "…" : "")}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="예: 또 다 망친 것 같아…"
          className="max-h-32 flex-1 resize-none rounded-xl bg-bg px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy ? "…" : "보내기"}
        </button>
      </div>
    </section>
  );
}
