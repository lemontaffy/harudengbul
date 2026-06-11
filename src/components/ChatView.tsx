"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type PersonaId = "theo" | "nora";
interface Msg {
  role: "user" | "assistant" | "proactive";
  content: string;
}

const NAMES: Record<PersonaId, string> = { nora: "노라", theo: "테오" };

export default function ChatView({
  initialPersona,
  configured,
}: {
  initialPersona: PersonaId;
  configured: boolean;
}) {
  const [persona, setPersona] = useState<PersonaId>(initialPersona);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  const loadHistory = useCallback(
    async (p: PersonaId) => {
      const res = await fetch(`/api/messages?persona=${p}`);
      if (res.ok) {
        setMessages((await res.json()).messages);
        scrollToBottom();
      }
    },
    [scrollToBottom],
  );

  useEffect(() => {
    loadHistory(persona);
  }, [persona, loadHistory]);

  async function switchPersona(p: PersonaId) {
    if (p === persona || streaming) return;
    setPersona(p);
    // 활성 페르소나 영속(홈/컨텍스트 일관성)
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activePersona: p }),
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !configured) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        appendToLast(data.error ?? "오류가 발생했어요.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendToLast(decoder.decode(value, { stream: true }));
        scrollToBottom();
      }
    } catch {
      appendToLast("네트워크 오류");
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  }

  function appendToLast(chunk: string) {
    setMessages((m) => {
      const copy = [...m];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") {
        copy[copy.length - 1] = { ...last, content: last.content + chunk };
      }
      return copy;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* 페르소나 탭 */}
      <div className="mb-2 flex gap-2">
        {(["nora", "theo"] as const).map((p) => (
          <button
            key={p}
            onClick={() => switchPersona(p)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              persona === p ? "bg-accent text-black" : "bg-surface ring-1 ring-white/10"
            }`}
          >
            {NAMES[p]}
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-xs opacity-40">
            {NAMES[persona]}와 대화를 시작해 보세요.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.role === "user";
          return (
            <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-accent text-black"
                    : "bg-surface ring-1 ring-white/10"
                }`}
              >
                {m.content || (streaming && !mine ? "…" : "")}
              </div>
            </div>
          );
        })}
      </div>

      {/* 입력 */}
      {configured ? (
        <div className="mt-2 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="메시지…"
            className="max-h-32 flex-1 resize-none rounded-xl bg-surface px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            {streaming ? "…" : "전송"}
          </button>
        </div>
      ) : (
        <div className="mt-2 rounded-xl bg-surface p-3 text-center text-xs opacity-70">
          채팅하려면 먼저{" "}
          <a href="/settings" className="text-accent">
            설정 → AI 연결
          </a>
          을 입력하세요.
        </div>
      )}
    </div>
  );
}
