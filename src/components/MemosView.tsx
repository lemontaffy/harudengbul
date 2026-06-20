"use client";

import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/components/ui/Dialog";

export interface Memo {
  id: number;
  content: string;
  done: boolean;
  createdAt: string | null;
  doneAt: string | null;
}

const input =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

export default function MemosView({
  initialOpen,
  focusId,
}: {
  initialOpen: Memo[];
  focusId?: number | null;
}) {
  const dialog = useDialog();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [open, setOpen] = useState<Memo[]>(initialOpen);
  const [done, setDone] = useState<Memo[]>([]);
  const [weekDone, setWeekDone] = useState(0);
  const [doneLoaded, setDoneLoaded] = useState(false);
  const [capture, setCapture] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusHandledRef = useRef(false);

  // 검색 등에서 ?focus=<id> 로 들어오면: 미완료에 없으면 '해치운 것' 탭을 열어 찾는다.
  useEffect(() => {
    if (focusId == null) return;
    if (initialOpen.some((m) => m.id === focusId)) {
      setTab("open");
    } else {
      setTab("done");
      if (!doneLoaded) loadDone();
    }
    // 마운트 시 1회 — focusId 기준.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // 해당 메모가 화면에 그려지면 스크롤 + 잠깐 강조(1회).
  useEffect(() => {
    if (focusId == null || focusHandledRef.current) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-memo-id="${focusId}"]`);
    if (!el) return;
    focusHandledRef.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(focusId);
    const t = setTimeout(() => setHighlightId((v) => (v === focusId ? null : v)), 2500);
    return () => clearTimeout(t);
  }, [focusId, tab, open, done]);

  async function loadDone() {
    const res = await fetch("/api/memos?tab=done");
    if (res.ok) {
      const d = await res.json();
      setDone(d.memos);
      setWeekDone(d.weekDone ?? 0);
      setDoneLoaded(true);
    }
  }
  function switchTab(t: "open" | "done") {
    setTab(t);
    setMenuFor(null);
    if (t === "done" && !doneLoaded) loadDone();
  }

  // 캡처 — 엔터로 추가하고 포커스 유지(연속 입력).
  async function add() {
    const content = capture.trim();
    if (!content) return;
    setCapture("");
    const res = await fetch("/api/memos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const d = await res.json();
      setOpen((o) => [d.memo, ...o]);
    } else {
      setCapture(content);
    }
    captureRef.current?.focus();
  }

  async function check(m: Memo, doneVal: boolean) {
    await fetch(`/api/memos/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: doneVal }),
    });
    if (doneVal) {
      setOpen((o) => o.filter((x) => x.id !== m.id));
      setDoneLoaded(false); // 아카이브 다음 진입 시 갱신
    } else {
      setDone((d) => d.filter((x) => x.id !== m.id));
      setOpen((o) => [{ ...m, done: false, doneAt: null }, ...o]);
    }
    setMenuFor(null);
  }

  async function saveEdit(m: Memo) {
    const content = editText.trim();
    if (!content) return setEditing(null);
    await fetch(`/api/memos/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const upd = (xs: Memo[]) => xs.map((x) => (x.id === m.id ? { ...x, content } : x));
    setOpen(upd);
    setDone(upd);
    setEditing(null);
  }

  async function del(m: Memo) {
    if (!(await dialog.confirm({ message: "이 메모를 지울까요?", danger: true, confirmText: "지우기" }))) return;
    await fetch(`/api/memos/${m.id}`, { method: "DELETE" });
    setOpen((o) => o.filter((x) => x.id !== m.id));
    setDone((d) => d.filter((x) => x.id !== m.id));
    setMenuFor(null);
  }

  async function copy(m: Memo) {
    setMenuFor(null);
    try {
      await navigator.clipboard.writeText(m.content);
      setStatus("복사됨");
    } catch {
      setStatus("복사 실패");
    }
    setTimeout(() => setStatus(""), 1800);
  }

  async function promote(m: Memo) {
    setMenuFor(null);
    const res = await fetch(`/api/memos/${m.id}/promote`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setStatus(res.ok ? (d.created ? "테오에게 전달했어요 · 홈에서 등록" : "이미 전달돼 있어요") : "전달 실패");
    setTimeout(() => setStatus(""), 2500);
  }

  const list = tab === "open" ? open : done;

  return (
    <div className="flex flex-col gap-3">
      {/* 캡처 */}
      <div className="flex gap-2">
        <input
          ref={captureRef}
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          autoFocus
          placeholder="떠오른 걸 그냥 던져넣어요"
          className={input}
        />
        <button onClick={add} disabled={!capture.trim()} className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
          담기
        </button>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-2">
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`rounded-control px-3 py-1.5 text-xs ${tab === t ? "bg-accent text-black" : "bg-surface ring-1 ring-border"}`}
          >
            {t === "open" ? "주머니" : "해치운 것"}
          </button>
        ))}
        {status && <span className="ml-auto text-[11px] text-accent">{status}</span>}
      </div>

      {tab === "done" && weekDone > 0 && (
        <p className="text-[11px] opacity-60">이번 주 {weekDone}개 해치웠어요 👏</p>
      )}

      {/* 목록 */}
      {list.length === 0 ? (
        <p className="py-10 text-center text-sm opacity-40">
          {tab === "open" ? "주머니가 비어 있어요. 떠오르면 던져넣으세요." : "아직 해치운 게 없어요."}
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-1.5">
          {list.map((m) => (
            <li
              key={m.id}
              data-memo-id={m.id}
              className={`rounded-card bg-surface p-3 ring-1 transition-colors ${
                highlightId === m.id ? "ring-accent" : "ring-border"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => check(m, !m.done)}
                  aria-label={m.done ? "완료 해제" : "완료"}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 ring-border ${m.done ? "bg-accent text-black" : "bg-bg"}`}
                >
                  {m.done ? "✓" : ""}
                </button>
                {editing === m.id ? (
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(m)}
                    onBlur={() => saveEdit(m)}
                    autoFocus
                    className={`${input} flex-1`}
                  />
                ) : (
                  <button
                    onClick={() => setMenuFor((v) => (v === m.id ? null : m.id))}
                    className={`flex-1 break-words text-left text-sm ${m.done ? "opacity-50" : ""}`}
                  >
                    {m.content}
                  </button>
                )}
              </div>
              {menuFor === m.id && editing !== m.id && (
                <div className="mt-2 flex flex-wrap gap-2 pl-7 text-xs">
                  <button
                    onClick={() => copy(m)}
                    className="rounded-control bg-bg px-3 py-1 ring-1 ring-border"
                  >
                    복사
                  </button>
                  {!m.done && (
                    <button
                      onClick={() => promote(m)}
                      className="rounded-control bg-bg px-3 py-1 ring-1 ring-border"
                    >
                      테오에게 →
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditing(m.id);
                      setEditText(m.content);
                      setMenuFor(null);
                    }}
                    className="rounded-control bg-bg px-3 py-1 ring-1 ring-border"
                  >
                    수정
                  </button>
                  <button onClick={() => del(m)} className="rounded-control px-3 py-1 opacity-60 hover:text-red-400">
                    삭제
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
