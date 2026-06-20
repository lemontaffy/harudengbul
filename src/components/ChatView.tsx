"use client";

import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useDialog } from "@/components/ui/Dialog";
import { ImagePlus } from "lucide-react";
import ConnectionSwitcher from "@/components/ConnectionSwitcher";
import Markdown from "@/components/Markdown";

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
  pinned?: boolean;
  createdAt?: string;
}
interface Pin {
  id: number;
  role: string;
  content: string;
  createdAt?: string;
}
interface RoomHit {
  id: number;
  role: string;
  pinned: boolean;
  date: string | null;
  snippet: string;
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
  const [interrupted, setInterrupted] = useState(false); // 스트림 중단(백그라운드/끊김) — 수동 복구 안내
  const streamCtrl = useRef<AbortController | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<RoomHit[]>([]);
  const [searchTooShort, setSearchTooShort] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchSeq = useRef(0);
  const photoRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const focusParam = Number(searchParams.get("focus"));
  const focusDoneRef = useRef(false);

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

  const loadPins = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/pins?personaId=${id}`);
      if (res.ok) setPins((await res.json()).pins ?? []);
    } catch {
      /* 핀 목록 실패는 조용히 — 채팅 본 흐름엔 영향 없음 */
    }
  }, []);

  useEffect(() => {
    focusDoneRef.current = false;
    setPinsOpen(false);
    setSearchOpen(false);
    setSearchQ("");
    setSearchHits([]);
    loadHistory(personaId);
    loadPins(personaId);
  }, [personaId, loadHistory, loadPins]);

  // 대화방 내 검색 — 입력 디바운스(250ms). 현재 대화 상대의 메시지만(서버에서 스코프).
  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    const t = setTimeout(async () => {
      const mine = ++searchSeq.current;
      if (!q) {
        setSearchHits([]);
        setSearchTooShort(false);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/messages/search?personaId=${personaId}&q=${encodeURIComponent(q)}`,
        );
        const j = await res.json();
        if (mine !== searchSeq.current) return;
        setSearchHits(j.hits ?? []);
        setSearchTooShort(!!j.tooShort);
      } catch {
        if (mine === searchSeq.current) setSearchHits([]);
      } finally {
        if (mine === searchSeq.current) setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen, personaId]);

  // 최신 messages/hasMore 를 비동기 루프(scrollToMessage)에서 안전히 읽기 위한 ref 미러.
  const messagesRef = useRef<Msg[]>([]);
  const hasMoreRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

  // 과거 페이지 한 장을 위로 붙임(포커스 탐색 전용 — 스크롤 위치 보존). 더 불러왔으면 true.
  const loadOlderForFocus = useCallback(async (): Promise<boolean> => {
    if (!hasMoreRef.current) return false;
    const oldestId = messagesRef.current.find((m) => m.id != null)?.id;
    if (oldestId == null) return false;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const res = await fetch(`/api/messages?personaId=${personaId}&before=${oldestId}`);
    if (!res.ok) return false;
    const d = await res.json();
    setMessages((m) => [...d.messages, ...m]);
    setHasMore(!!d.hasMore);
    hasMoreRef.current = !!d.hasMore;
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prevHeight;
    });
    return (d.messages?.length ?? 0) > 0;
  }, [personaId]);

  // 특정 메시지로 스크롤 + 잠깐 강조. 화면에 없으면 과거 페이지를 당겨가며 찾는다.
  const scrollToMessage = useCallback(
    async (id: number) => {
      for (let i = 0; i < 40; i++) {
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          setHighlightId(id);
          setTimeout(() => setHighlightId((v) => (v === id ? null : v)), 2500);
          return true;
        }
        const more = await loadOlderForFocus();
        if (!more) break;
        await nextFrame(); // setMessages 커밋 후 DOM 반영 대기
      }
      return false;
    },
    [loadOlderForFocus],
  );

  // 핀 토글 — 낙관적 갱신 후 서버 반영, 핀 목록 새로고침.
  async function togglePin(id: number, next: boolean) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, pinned: next } : x)));
    setMenuFor(null);
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) throw new Error();
      await loadPins(personaId);
    } catch {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, pinned: !next } : x)));
      showToast("핀을 바꾸지 못했어요");
    }
  }

  // 검색 결과 등에서 ?focus=<id> 로 들어오면 그 메시지로 이동(최초 1회).
  useEffect(() => {
    if (focusDoneRef.current) return;
    if (!Number.isInteger(focusParam) || focusParam <= 0) return;
    if (messages.length === 0) return;
    focusDoneRef.current = true;
    void scrollToMessage(focusParam);
  }, [focusParam, messages.length, scrollToMessage]);

  // 백그라운드 진입 시 진행 중 스트림을 정리(모바일은 곧 JS가 멈춰 reader가 영영 안 끝남 →
  // streaming 플래그가 고착돼 입력이 막히는 멈춤 버그). abort → catch에서 중단 표시.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && streamCtrl.current) streamCtrl.current.abort();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

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
    setInterrupted(false);
    scrollToBottom();
    const ctrl = new AbortController();
    streamCtrl.current = ctrl;
    let cut = false; // 중단(abort/끊김) 여부 — 끊기면 부분 응답 보존 + 안내
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, message: text, attachmentPath: photo ?? undefined }),
        signal: ctrl.signal,
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
    } catch (e) {
      // AbortError = 백그라운드 진입 등으로 의도적 정리. 그 외 = 네트워크 끊김.
      cut = true;
      setInterrupted(true);
      if ((e as Error)?.name !== "AbortError") appendToLast(" …(응답이 끊겼어요)");
    } finally {
      streamCtrl.current = null;
      setStreaming(false);
      // 정상 종료만 서버 동기화(끊김 땐 부분 응답을 보존하고 사용자가 ‘다시 불러오기’로 복구).
      if (!cut && personaId != null) await loadHistory(personaId); // id/hadToolCall 동기화
    }
  }

  // 중단된 응답을 서버 기준으로 다시 불러오기(자동 재연결 금지 — 중복 메시지 방지). 서버가
  // 백그라운드에서 답을 마쳤으면 여기서 완성본이 들어온다.
  async function reloadAfterInterrupt() {
    setInterrupted(false);
    if (personaId != null) await loadHistory(personaId);
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
      {/* 상단 도구막대 — 고정됨 토글 + 이 대화 검색 */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 py-1.5 text-[11px]">
          {pins.length > 0 ? (
            <button
              onClick={() => setPinsOpen((v) => !v)}
              className="flex items-center gap-1 opacity-70 hover:opacity-100"
            >
              <span>📌 고정됨 {pins.length}</span>
              <span className="opacity-50">{pinsOpen ? "▲" : "▼"}</span>
            </button>
          ) : (
            <span className="opacity-30">이 대화</span>
          )}
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              setPinsOpen(false);
            }}
            aria-label="이 대화에서 검색"
            className={`ml-auto flex items-center gap-1 rounded-control px-2 py-1 ring-1 ring-border ${
              searchOpen ? "text-accent" : "opacity-70 hover:opacity-100"
            }`}
          >
            🔎 <span>검색</span>
          </button>
        </div>

        {/* 고정됨 목록 */}
        {pins.length > 0 && pinsOpen && (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto pb-1.5">
            {pins.map((p) => (
              <li
                key={p.id}
                className="flex items-start gap-2 rounded-control bg-surface px-2 py-1.5 text-xs ring-1 ring-border"
              >
                <button
                  onClick={() => scrollToMessage(p.id)}
                  className="line-clamp-2 flex-1 text-left opacity-90 hover:text-accent"
                >
                  {p.content}
                </button>
                <button
                  onClick={() => togglePin(p.id, false)}
                  aria-label="핀 해제"
                  className="shrink-0 opacity-40 hover:opacity-90"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 검색 패널 */}
        {searchOpen && (
          <div className="pb-1.5">
            <div className="flex items-center gap-2 rounded-control bg-surface px-2.5 py-1.5 ring-1 ring-border">
              <span className="opacity-50">🔎</span>
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="이 대화에서 찾기"
                className="w-full bg-transparent text-sm outline-none placeholder:opacity-40"
              />
              {searchQ && (
                <button onClick={() => setSearchQ("")} aria-label="지우기" className="opacity-40 hover:opacity-80">
                  ✕
                </button>
              )}
            </div>
            {searchTooShort && (
              <p className="px-1 py-2 text-[11px] opacity-50">두 글자 이상 입력하면 찾아드려요.</p>
            )}
            {!searchTooShort && searchQ.trim() && !searchLoading && searchHits.length === 0 && (
              <p className="px-1 py-2 text-[11px] opacity-50">‘{searchQ.trim()}’ 결과가 없어요.</p>
            )}
            {searchHits.length > 0 && (
              <ul className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {searchHits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => {
                        setSearchOpen(false);
                        scrollToMessage(h.id);
                      }}
                      className={`flex w-full flex-col gap-0.5 rounded-control p-2 text-left ring-1 ${
                        h.pinned ? "bg-accent/10 ring-accent/50" : "bg-surface ring-border"
                      } hover:ring-accent`}
                    >
                      <div className="flex items-center gap-1 text-[10px] opacity-50">
                        <span>{h.role === "user" ? "나" : "상대"}</span>
                        {h.pinned && <span title="고정됨">📌</span>}
                        <span className="ml-auto">{h.date ? dayLabel(h.date) : ""}</span>
                      </div>
                      <span className="line-clamp-2 text-xs opacity-90">{h.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
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
              <div
                data-mid={m.id ?? undefined}
                className={`group flex flex-col rounded-card transition-colors ${
                  highlightId === m.id ? "bg-accent/15 ring-1 ring-accent" : ""
                }`}
              >
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
                      <div className="px-3 py-2 text-sm leading-relaxed">
                        {mine ? (
                          // 사용자 입력은 그대로(마크다운 해석 안 함 — '*' 등 의도치 않은 변형 방지).
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        ) : m.content ? (
                          <Markdown>{m.content}</Markdown>
                        ) : (
                          "…"
                        )}
                      </div>
                    )}
                  </div>
                  {canMenu && (
                    <button
                      onClick={() => setMenuFor((v) => (v === i ? null : i))}
                      className="self-center px-1.5 py-1 text-base leading-none text-text-dim opacity-70 hover:opacity-100"
                      aria-label="메시지 메뉴 (재생성·이어쓰기·삭제)"
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
                  {m.pinned && <span className="mr-1 opacity-90">📌</span>}
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
                      onClick={() => togglePin(m.id!, !m.pinned)}
                      className={`rounded-control bg-bg px-2 py-1 ring-1 ring-border hover:text-accent ${
                        m.pinned ? "text-accent" : ""
                      }`}
                    >
                      {m.pinned ? "핀 해제" : "핀"}
                    </button>
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
          {interrupted && !streaming && (
            <div className="mb-2 flex items-center gap-2 rounded-control bg-surface px-3 py-2 text-xs ring-1 ring-border">
              <span className="flex-1 opacity-70">응답이 중간에 끊겼어요.</span>
              <button
                onClick={reloadAfterInterrupt}
                className="shrink-0 rounded-control bg-accent px-3 py-1 font-medium text-black"
              >
                다시 불러오기
              </button>
              <button
                onClick={() => setInterrupted(false)}
                className="shrink-0 rounded-control px-2 py-1 opacity-60 ring-1 ring-border"
              >
                닫기
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
