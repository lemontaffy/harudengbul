"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Role = "counselor" | "secretary";
export interface ChatPersona {
  id: number;
  name: string | null;
  role: Role;
  avatarPath: string | null;
}
interface Msg {
  role: "user" | "assistant" | "proactive";
  content: string;
}

const ROLE_LABEL: Record<Role, string> = {
  counselor: "상담가",
  secretary: "비서",
};

function displayName(p: ChatPersona): string {
  return p.name?.trim() || "이름 없는 캐릭터";
}

export default function ChatView({
  personas,
  initialPersonaId,
  userAvatarPath,
  configured,
}: {
  personas: ChatPersona[];
  initialPersonaId: number | null;
  userAvatarPath: string | null;
  configured: boolean;
}) {
  const firstId = personas[0]?.id ?? null;
  const [personaId, setPersonaId] = useState<number | null>(
    initialPersonaId && personas.some((p) => p.id === initialPersonaId)
      ? initialPersonaId
      : firstId,
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = personas.find((p) => p.id === personaId) ?? null;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  const loadHistory = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/messages?personaId=${id}`);
      if (res.ok) {
        setMessages((await res.json()).messages);
        scrollToBottom();
      }
    },
    [scrollToBottom],
  );

  useEffect(() => {
    if (personaId != null) loadHistory(personaId);
  }, [personaId, loadHistory]);

  async function switchPersona(id: number) {
    if (id === personaId || streaming) return;
    setPersonaId(id);
    // 활성 캐릭터 영속(홈/컨텍스트 일관성)
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activePersonaId: id }),
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !configured || personaId == null) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, message: text }),
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

  if (personas.length === 0) {
    return (
      <div className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center text-center text-sm opacity-70">
        <p>아직 대화할 캐릭터가 없어요.</p>
        <a href="/settings" className="mt-2 text-accent">
          설정에서 캐릭터 추가하기
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* 캐릭터 탭 — 활성 캐릭터 전체 */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => switchPersona(p.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
              personaId === p.id ? "bg-accent text-black" : "bg-surface ring-1 ring-white/10"
            }`}
          >
            {p.avatarPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarPath} alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            <span>{displayName(p)}</span>
            <span className="opacity-50">· {ROLE_LABEL[p.role]}</span>
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        {messages.length === 0 && current && (
          <p className="mt-10 text-center text-xs opacity-40">
            {displayName(current)}와 대화를 시작해 보세요.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.role === "user";
          const avatar = mine ? userAvatarPath : current?.avatarPath;
          return (
            <div
              key={i}
              className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
            >
              {!mine &&
                (avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 shrink-0 rounded-full bg-white/10" />
                ))}
              <div
                className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-accent text-black"
                    : "bg-surface ring-1 ring-white/10"
                }`}
              >
                {m.content || (streaming && !mine ? "…" : "")}
              </div>
              {mine && avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              )}
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
