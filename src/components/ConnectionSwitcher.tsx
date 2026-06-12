"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ConnLite {
  id: number;
  name: string;
}

// 연결별 색 점(결정적). 대화방 입력줄·홈에서 공용으로 쓰는 컴팩트 스위처.
const DOT = ["#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#eab308"];
const colorFor = (id: number) => DOT[((id % DOT.length) + DOT.length) % DOT.length];
const initials = (name: string) => name.trim().slice(0, 2) || "AI";

export default function ConnectionSwitcher({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const router = useRouter();
  const [conns, setConns] = useState<ConnLite[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setConns(d.connections.map((c: ConnLite) => ({ id: c.id, name: c.name })));
          setActiveId(d.activeId);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  async function pick(id: number) {
    setActiveId(id);
    setOpen(false);
    await fetch(`/api/connections/${id}/activate`, { method: "POST" });
    router.refresh(); // 입력 텍스트는 ChatView state라 보존됨(이 컴포넌트는 별도)
  }

  if (!ready) {
    return <div className="h-9 w-9 shrink-0 rounded-full bg-surface ring-1 ring-border" />;
  }
  // 연결 0개 — 설정 안내(아이콘만).
  if (conns.length === 0) {
    return (
      <a
        href="/settings"
        title="AI 연결 설정"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-[10px] opacity-70 ring-1 ring-border"
      >
        AI
      </a>
    );
  }
  const active = conns.find((c) => c.id === activeId) ?? conns[0];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={`메인 연결: ${active?.name ?? ""}`}
        aria-label={`메인 AI 연결 (${active?.name ?? ""}) — 전환`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black ring-1 ring-border disabled:opacity-40"
        style={{ background: active ? colorFor(active.id) : "#888" }}
      >
        {active ? initials(active.name) : "AI"}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-card bg-surface p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
            <p className="mb-2 px-1 text-xs opacity-50">메인 AI 연결</p>
            <ul className="flex flex-col gap-1">
              {conns.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => pick(c.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${
                      c.id === activeId ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: colorFor(c.id) }}
                    />
                    <span className="truncate">{c.name}</span>
                    {c.id === activeId && (
                      <span className="ml-auto text-[11px] opacity-70">메인</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
