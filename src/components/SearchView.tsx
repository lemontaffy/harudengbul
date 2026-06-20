"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchType = "chat" | "diary" | "memo";
interface Hit {
  type: SearchType;
  id: number;
  personaId?: number;
  personaName?: string;
  date: string | null;
  snippet: string;
  pinned?: boolean;
  href: string;
}
export interface PersonaOpt {
  id: number;
  name: string;
}

const TYPE_META: Record<SearchType, { label: string; badge: string; cls: string }> = {
  chat: { label: "채팅", badge: "💬", cls: "bg-accent/15 text-accent ring-accent/40" },
  diary: { label: "일기", badge: "📔", cls: "bg-surface-2 ring-border" },
  memo: { label: "메모", badge: "🗒", cls: "bg-surface-2 ring-border" },
};

function fmtDate(type: SearchType, date: string | null): string {
  if (!date) return "";
  const d = new Date(type === "diary" ? `${date}T12:00:00` : date);
  if (isNaN(d.getTime())) return "";
  const base = d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  if (type === "diary") return base;
  return `${base} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function SearchView({ personas }: { personas: PersonaOpt[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | SearchType>("all");
  const [persona, setPersona] = useState<number | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [tooShort, setTooShort] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const query = q.trim();
    const mine = ++seq.current;
    if (!query) {
      setHits([]);
      setTooShort(false);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const p = new URLSearchParams({ q: query, type });
    if (type === "chat" && persona) p.set("persona", String(persona));
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    try {
      const res = await fetch(`/api/search?${p.toString()}`);
      const j = await res.json();
      if (mine !== seq.current) return; // 더 최신 검색이 끝남 — 이 결과는 버림
      setHits(j.hits ?? []);
      setTooShort(!!j.tooShort);
      setSearched(true);
    } catch {
      if (mine === seq.current) {
        setHits([]);
        setSearched(true);
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, type, persona, from, to]);

  // 디바운스(입력/필터 변경 300ms 후 검색).
  useEffect(() => {
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [run]);

  const empty = searched && !loading && !tooShort && hits.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* 검색 바 */}
      <div className="flex items-center gap-2 rounded-card bg-surface px-3 py-2 ring-1 ring-border">
        <span className="opacity-50">🔎</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="채팅·일기·메모에서 찾기"
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-40"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="지우기" className="shrink-0 opacity-40 hover:opacity-80">
            ✕
          </button>
        )}
      </div>

      {/* 타입 칩 + 필터 토글 */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(["all", "chat", "diary", "memo"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-control px-2.5 py-1 ring-1 ${
              type === t ? "bg-accent text-black ring-accent" : "bg-surface ring-border opacity-70"
            }`}
          >
            {t === "all" ? "전체" : TYPE_META[t].label}
          </button>
        ))}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`ml-auto rounded-control px-2.5 py-1 ring-1 ${
            showFilters || from || to || persona ? "bg-surface-2 ring-border" : "bg-surface ring-border opacity-60"
          }`}
        >
          필터{from || to || persona ? " ·" : ""}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-2 rounded-card bg-surface p-3 text-xs ring-1 ring-border">
          {type === "chat" && personas.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="w-12 shrink-0 opacity-60">상대</span>
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value ? Number(e.target.value) : "")}
                className="flex-1 rounded-control bg-bg px-2 py-1.5 ring-1 ring-border outline-none"
              >
                <option value="">전체</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="w-12 shrink-0 opacity-60">기간</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 rounded-control bg-bg px-2 py-1.5 ring-1 ring-border outline-none"
            />
            <span className="opacity-40">~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 rounded-control bg-bg px-2 py-1.5 ring-1 ring-border outline-none"
            />
          </label>
        </div>
      )}

      {/* 상태 / 결과 */}
      {tooShort && (
        <p className="py-8 text-center text-xs opacity-50">두 글자 이상 입력하면 찾아드려요.</p>
      )}
      {empty && (
        <p className="py-8 text-center text-xs opacity-50">‘{q.trim()}’에 해당하는 결과가 없어요.</p>
      )}
      {!searched && !q.trim() && (
        <p className="py-8 text-center text-xs opacity-40">
          어디에 적었는지 기억나지 않아도 괜찮아요. 단어로 찾아보세요.
        </p>
      )}

      {hits.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {hits.map((h) => {
            const meta = TYPE_META[h.type];
            return (
              <li key={`${h.type}-${h.id}`}>
                <button
                  onClick={() => router.push(h.href)}
                  className={`flex w-full flex-col gap-1 rounded-card p-3 text-left ring-1 ${
                    h.pinned ? "bg-accent/10 ring-accent/50" : "bg-surface ring-border"
                  } hover:ring-accent`}
                >
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-1.5 py-0.5 ring-1 ${meta.cls}`}>
                      {meta.badge} {meta.label}
                    </span>
                    {h.type === "chat" && h.personaName && (
                      <span className="opacity-60">· {h.personaName}</span>
                    )}
                    {h.pinned && <span title="고정됨">📌</span>}
                    <span className="ml-auto opacity-40">{fmtDate(h.type, h.date)}</span>
                  </div>
                  <p className="text-sm leading-relaxed opacity-90">{h.snippet}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
