"use client";

import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import { useDialog } from "@/components/ui/Dialog";
import { ImagePlus } from "lucide-react";
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
  attachmentPath?: string | null;
  createdAt?: string;
}

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
  persona,
  userAvatarPath,
  configured,
  supportsVision,
}: {
  persona: ChatPersona;
  userAvatarPath: string | null;
  configured: boolean;
  supportsVision: boolean;
}) {
  const dialog = useDialog();
  const personaId = persona.id;
  const current = persona;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  // 파일 1장 업로드 → 미리보기(pendingPhoto)로. 파일 선택·붙여넣기 공용.
  async function uploadPhoto(file: File) {
    if (!supportsVision) {
      showToast("이 연결은 사진을 볼 수 없어요");
      return;
    }
    if (uploadingPhoto) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setPendingPhoto(d.path);
      else showToast(d.error ?? "업로드 실패");
    } catch {
      showToast("네트워크 오류");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadPhoto(file);
  }

  // 클립보드 이미지 붙여넣기(Ctrl/⌘+V) → 첨부. 텍스트 붙여넣기는 그대로 둔다.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          void uploadPhoto(file);
          return;
        }
      }
    }
  }

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
    loadHistory(personaId);
  }, [personaId, loadHistory]);

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
    const photo = pendingPhoto;
    if ((!text && !photo) || streaming || !configured || personaId == null) return;
    setInput("");
    setPendingPhoto(null);
    setMenuFor(null);
    const nowIso = new Date().toISOString();
    setMessages((m) => [
      ...m,
      { role: "user", content: text, attachmentPath: photo, createdAt: nowIso },
      { role: "assistant", content: "", createdAt: nowIso },
    ]);
    setStreaming(true);
    scrollToBottom();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, message: text, attachmentPath: photo ?? undefined }),
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
    if (!(await dialog.confirm({ message: text, danger: true, confirmText: "삭제" }))) return;
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

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") { lastAssistantIdx = i; break; }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto py-2">
        {hasMore && (
          <div className="flex justify-center py-1">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full bg-surface px-3 py-1 text-[11px] opacity-70 ring-1 ring-border disabled:opacity-40"
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
                  <div className="h-px flex-1 bg-surface-2" />
                  <span>{dayLabel(m.createdAt)}</span>
                  <div className="h-px flex-1 bg-surface-2" />
                </div>
              )}
              <div className="group flex flex-col">
                <div className={`flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine &&
                    (avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="h-6 w-6 shrink-0 rounded-full bg-surface-2" />
                    ))}
                  <div
                    className={`max-w-[78%] overflow-hidden rounded-card text-sm ${
                      mine ? "bg-accent text-black" : "bg-surface ring-1 ring-border"
                    }`}
                  >
                    {m.attachmentPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.attachmentPath}
                        alt="첨부 사진"
                        onClick={() => setLightbox(m.attachmentPath!)}
                        className="max-h-64 w-full cursor-zoom-in object-cover"
                      />
                    )}
                    {(m.content || (streaming && !mine)) && (
                      <div className="whitespace-pre-wrap px-3 py-2">
                        {m.content || (streaming && !mine ? "…" : "")}
                      </div>
                    )}
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
                        className="rounded-control bg-bg px-2 py-1 ring-1 ring-border hover:text-accent"
                      >
                        재생성
                      </button>
                    )}
                    {m.role === "assistant" && (
                      <button
                        onClick={() => continueWrite(i)}
                        className="rounded-control bg-bg px-2 py-1 ring-1 ring-border hover:text-accent"
                      >
                        이어쓰기
                      </button>
                    )}
                    <button
                      onClick={() => del(i)}
                      className="rounded-control bg-bg px-2 py-1 ring-1 ring-border hover:text-red-400"
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
        <div className="border-t border-border pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          {/* 첨부 사진 미리보기 — 보내기 전 확인·제거 가능. 탭하면 크게. */}
          {pendingPhoto && (
            <div className="mb-2 flex items-center gap-2 rounded-control bg-bg p-2 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setLightbox(pendingPhoto)}
                aria-label="첨부 사진 크게 보기"
                className="relative shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingPhoto} alt="첨부 사진" className="h-14 w-14 rounded-control object-cover ring-1 ring-border" />
              </button>
              <span className="flex-1 text-xs opacity-70">사진 1장 첨부됨 · 보내면 함께 전송돼요</span>
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="shrink-0 rounded-control px-3 py-1.5 text-xs opacity-70 ring-1 ring-border hover:text-red-400"
              >
                제거
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* 메인 연결 전환 — streaming 중 비활성. 입력 텍스트는 유지. */}
            <ConnectionSwitcher disabled={streaming} />
            {/* 사진 — 비전 연결일 때만 활성(아니면 탭 시 토스트) */}
            <button
              type="button"
              disabled={streaming || uploadingPhoto}
              onClick={() => {
                if (!supportsVision) {
                  showToast("이 연결은 사진을 볼 수 없어요");
                  return;
                }
                photoRef.current?.click();
              }}
              aria-label="사진 첨부"
              title={supportsVision ? "사진 첨부" : "이 연결은 사진을 볼 수 없어요"}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ring-border disabled:opacity-40 ${supportsVision ? "" : "opacity-40"}`}
            >
              <ImagePlus size={18} />
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPickPhoto}
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              placeholder={
                uploadingPhoto
                  ? "사진 올리는 중…"
                  : supportsVision
                    ? "메시지… (사진 붙여넣기 가능)"
                    : "메시지…"
              }
              className="max-h-32 flex-1 resize-none rounded-xl bg-surface px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent"
            />
            <button
              onClick={send}
              disabled={streaming || (!input.trim() && !pendingPhoto)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              {streaming ? "…" : "전송"}
            </button>
          </div>
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

      {/* 토스트 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-xs text-white">
          {toast}
        </div>
      )}
      {/* 확대 보기 */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}
