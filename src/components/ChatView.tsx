"use client";

import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import ConnectionSwitcher from "@/components/ConnectionSwitcher";

type Role = "counselor" | "secretary" | "nutritionist" | "study_mate" | "friend";
export interface ChatPersona {
  id: number;
  name: string | null;
  roles: Role[];
  avatarPath: string | null;
}
interface Msg {
  id?: number;
  role: "user" | "assistant" | "proactive";
  content: string;
  hadToolCall?: boolean;
  createdAt?: string;
}

const ROLE_LABEL: Record<Role, string> = {
  counselor: "상담가",
  secretary: "비서",
  nutritionist: "영양사",
  study_mate: "스터디 메이트",
  friend: "친구",
};
const rolesLabel = (roles: Role[]) => roles.map((r) => ROLE_LABEL[r]).join(" · ");

function displayName(p: ChatPersona): string {
  return p.name?.trim() || "이름 없는 캐릭터";
}

// 날짜 경계/표시 — 로컬 기준. "오늘"은 렌더 시점 기준이라 날이 지나면 그 날짜로 바뀐다.
function dayKey(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((midnight(new Date()) - midnight(d)) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function timeLabel(iso?: string): string {
  return (iso ? new Date(iso) : new Date()).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
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
        const d = await res.json();
        setMessages(d.messages);
        setHasMore(!!d.hasMore);
        setMenuFor(null);
        scrollToBottom();
        fetch(`/api/personas/${id}/read`, { method: "POST" }).catch(() => {});
      }
    },
    [scrollToBottom],
  );

  // 이전(과거) 페이지를 위로 붙임 — 스크롤 위치 보존.
  async function loadMore() {
    if (loadingMore || personaId == null) return;
    const oldestId = messages.find((m) => m.id != null)?.id;
    if (oldestId == null) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(`/api/messages?personaId=${personaId}&before=${oldestId}`);
      if (res.ok) {
        const d = await res.json();
        setMessages((m) => [...d.messages, ...m]);
        setHasMore(!!d.hasMore);
        requestAnimationFrame(() => {
          if (el) el.scrollTop += el.scrollHeight - prevHeight;
        });
      }
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (personaId != null) loadHistory(personaId);
  }, [personaId, loadHistory]);

  async function switchPersona(id: number) {
    if (id === personaId || streaming) return;
    setPersonaId(id);
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activePersonaId: id }),
    });
  }

  function patchContentAt(idx: number, fn: (prev: string) => string) {
    setMessages((m) => {
      const c = [...m];
      if (c[idx]) c[idx] = { ...c[idx], content: fn(c[idx].content) };
      return c;
    });
  }
  function appendToLast(chunk: string) {
    setMessages((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last && last.role === "assistant") {
        c[c.length - 1] = { ...last, content: last.content + chunk };
      }
      return c;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !configured || personaId == null) return;
    setInput("");
    setMenuFor(null);
    const nowIso = new Date().toISOString();
    setMessages((m) => [
      ...m,
      { role: "user", content: text, createdAt: nowIso },
      { role: "assistant", content: "", createdAt: nowIso },
    ]);
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
      if (personaId != null) await loadHistory(personaId); // id/hadToolCall 동기화
    }
  }

  // 메시지 액션 공통 — 지정 인덱스 말풍선에 스트림을 반영.
  async function runActionStream(url: string, idx: number, clearFirst: boolean) {
    if (streaming) return;
    setMenuFor(null);
    setStreaming(true);
    if (clearFirst) patchContentAt(idx, () => "");
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        patchContentAt(idx, (prev) => (clearFirst ? "" : prev) + (d.error ?? "오류가 발생했어요."));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        patchContentAt(idx, (prev) => prev + chunk);
        scrollToBottom();
      }
    } catch {
      patchContentAt(idx, (prev) => prev + "네트워크 오류");
    } finally {
      setStreaming(false);
      if (personaId != null) await loadHistory(personaId);
    }
  }

  function regenerate(idx: number) {
    const id = messages[idx]?.id;
    if (id == null) return;
    runActionStream(`/api/messages/${id}/regenerate`, idx, true);
  }
  function continueWrite(idx: number) {
    const id = messages[idx]?.id;
    if (id == null) return;
    runActionStream(`/api/messages/${id}/continue`, idx, false);
  }
  async function del(idx: number) {
    const msg = messages[idx];
    if (!msg?.id || streaming) return;
    let warnTools = false;
    if (msg.role === "user") {
      for (let j = idx + 1; j < messages.length; j++) {
        if (messages[j].role === "user") break;
        if (messages[j].hadToolCall) { warnTools = true; break; }
      }
    } else {
      warnTools = !!msg.hadToolCall;
    }
    const base =
      msg.role === "user"
        ? "이 메시지와 그에 대한 답장을 삭제할까요?"
        : "이 메시지를 삭제할까요?";
    const text = base + (warnTools ? "\n(등록된 일정·가계부 기록은 삭제되지 않아요.)" : "");
    if (!confirm(text)) return;
    setMenuFor(null);
    await fetch(`/api/messages/${msg.id}`, { method: "DELETE" });
    if (personaId != null) await loadHistory(personaId);
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

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") { lastAssistantIdx = i; break; }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* 메인 연결 전환 */}
      <div className="mb-2 flex justify-end">
        <ConnectionSwitcher />
      </div>
      {/* 캐릭터 탭 */}
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
            <span className="opacity-50">· {rolesLabel(p.roles)}</span>
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        {hasMore && (
          <div className="flex justify-center py-1">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full bg-surface px-3 py-1 text-[11px] opacity-70 ring-1 ring-white/10 disabled:opacity-40"
            >
              {loadingMore ? "불러오는 중…" : "이전 메시지 더 보기"}
            </button>
          </div>
        )}
        {messages.length === 0 && current && (
          <p className="mt-10 text-center text-xs opacity-40">
            {displayName(current)}와 대화를 시작해 보세요.
          </p>
        )}
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const showDivider = !prev || dayKey(m.createdAt) !== dayKey(prev.createdAt);
          const mine = m.role === "user";
          const avatar = mine ? userAvatarPath : current?.avatarPath;
          const canMenu = m.id != null && !streaming;
          const showRegen = m.role === "assistant" && i === lastAssistantIdx && !m.hadToolCall;
          return (
            <Fragment key={m.id ?? `tmp-${i}`}>
              {showDivider && (
                <div className="flex items-center gap-2 py-1.5 text-[10px] opacity-40">
                  <div className="h-px flex-1 bg-white/10" />
                  <span>{dayLabel(m.createdAt)}</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
              )}
              <div className="group flex flex-col">
                <div className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine &&
                    (avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 shrink-0 rounded-full bg-white/10" />
                    ))}
                  <div
                    className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-accent text-black" : "bg-surface ring-1 ring-white/10"
                    }`}
                  >
                    {m.content || (streaming && !mine ? "…" : "")}
                  </div>
                  {canMenu && (
                    <button
                      onClick={() => setMenuFor((v) => (v === i ? null : i))}
                      className="self-center px-1 text-xs opacity-40 transition group-hover:opacity-80"
                      aria-label="메시지 메뉴"
                    >
                      ⋯
                    </button>
                  )}
                  {mine && avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  )}
                </div>

                <div className={`mt-0.5 px-1 text-[10px] opacity-30 ${mine ? "text-right" : "pl-8"}`}>
                  {timeLabel(m.createdAt)}
                </div>

                {menuFor === i && canMenu && (
                  <div
                    className={`mt-1 flex gap-1.5 text-[11px] ${
                      mine ? "justify-end" : "justify-start pl-7"
                    }`}
                  >
                    {showRegen && (
                      <button
                        onClick={() => regenerate(i)}
                        className="rounded-lg bg-bg px-2 py-1 ring-1 ring-white/10 hover:text-accent"
                      >
                        재생성
                      </button>
                    )}
                    {m.role === "assistant" && (
                      <button
                        onClick={() => continueWrite(i)}
                        className="rounded-lg bg-bg px-2 py-1 ring-1 ring-white/10 hover:text-accent"
                      >
                        이어쓰기
                      </button>
                    )}
                    <button
                      onClick={() => del(i)}
                      className="rounded-lg bg-bg px-2 py-1 ring-1 ring-white/10 hover:text-red-400"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </Fragment>
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
