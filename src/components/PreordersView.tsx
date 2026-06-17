"use client";

import { useEffect, useMemo, useState } from "react";

interface Fx { rate: number; asOf: string | null; fetchedAt: string }
// 현재 환율(1 from = ? to) 훅 — /api/fx(무료 소스, 6h 캐시). 실패 시 null(수동 입력 폴백).
//   refresh(): 캐시 무시 강제 재조회. busy: 조회 중. data: {rate, asOf(기준일), fetchedAt(받아온 시각)}.
function useFx(from: string, to = "KRW") {
  const [data, setData] = useState<Fx | null>(null);
  const [busy, setBusy] = useState(false);
  async function fetchRate(force = false) {
    setBusy(true);
    try {
      const r = await fetch(`/api/fx?from=${encodeURIComponent(from)}&to=${to}${force ? "&refresh=1" : ""}`);
      const d = await r.json();
      if (typeof d.rate === "number") setData({ rate: d.rate, asOf: d.asOf ?? null, fetchedAt: d.fetchedAt });
    } catch {
      /* 유지(폴백) */
    } finally {
      setBusy(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchRate(false); }, [from, to]);
  return { data, busy, refresh: () => fetchRate(true) };
}

// 환율 줄 — 현재 환율 + 마지막 갱신 시각 + 새로고침 버튼.
function FxLine({ cur, fx }: { cur: string; fx: ReturnType<typeof useFx> }) {
  if (!fx.data) {
    return fx.busy ? <span className="text-[11px] text-text-dim">환율 불러오는 중…</span> : null;
  }
  const at = new Date(fx.data.fetchedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
      <span className="text-accent">1 {cur} ≈ ₩{fx.data.rate.toFixed(1)}</span>
      <span>· 갱신 {at}{fx.data.asOf ? ` · 기준 ${fx.data.asOf}` : ""}</span>
      <button type="button" onClick={fx.refresh} disabled={fx.busy} className="rounded-full px-1.5 ring-1 ring-border disabled:opacity-50">
        {fx.busy ? "…" : "↻"}
      </button>
    </div>
  );
}

export interface Preorder {
  id: number;
  name: string;
  currency: string;
  depositAmount: number | null;
  depositKrw: number;
  depositDate: string;
  balanceAmount: number | null;
  balanceKrwEstimate: number;
  balanceDueDate: string;
  balanceKrwActual: number | null;
  status: "pending" | "paid";
  paidAt: string | null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const cny = (n: number, cur: string) => `${cur === "CNY" ? "¥" : ""}${n.toLocaleString("ko-KR")}${cur !== "CNY" ? " " + cur : ""}`;
const inputCls = "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
// 임박/초과 판정 — D-7 이내 임박, 오늘 지나면 초과.
function dueState(due: string, today: string): "overdue" | "soon" | "normal" {
  if (due < today) return "overdue";
  const d = (new Date(due + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000;
  return d <= 7 ? "soon" : "normal";
}

export default function PreordersView({ initial = [] }: { initial?: Preorder[] }) {
  const [list, setList] = useState<Preorder[]>(initial);
  const [adding, setAdding] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const today = todayKst();

  const pending = useMemo(
    () => list.filter((p) => p.status === "pending").sort((a, b) => a.balanceDueDate.localeCompare(b.balanceDueDate)),
    [list],
  );
  const paid = useMemo(() => list.filter((p) => p.status === "paid"), [list]);
  const waitingKrw = pending.reduce((a, p) => a + p.balanceKrwEstimate, 0);
  const waitingCny = pending.reduce((a, p) => a + (p.balanceAmount ?? 0), 0);

  function upsert(p: Preorder) {
    setList((xs) => (xs.some((x) => x.id === p.id) ? xs.map((x) => (x.id === p.id ? p : x)) : [p, ...xs]));
  }
  async function del(id: number) {
    setList((xs) => xs.filter((x) => x.id !== id));
    await fetch(`/api/preorders/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 대기 잔금 합계 — 가계부 지출 합계와 완전 별개(아직 안 낸 돈). */}
      <div className="rounded-card bg-surface p-4">
        <div className="text-xs text-text-dim">대기 잔금 합계 (아직 낼 돈 · 가계부 지출과 별개)</div>
        <div className="mt-1 font-display text-2xl font-semibold">{won(waitingKrw)}</div>
        {waitingCny > 0 && <div className="text-xs text-text-dim">≈ ¥{waitingCny.toLocaleString("ko-KR")} · 대기 {pending.length}건</div>}
      </div>

      <button
        onClick={() => setAdding((v) => !v)}
        className="rounded-control bg-accent px-3 py-2 text-sm font-medium text-black"
      >
        {adding ? "닫기" : "+ 예약 추가"}
      </button>

      {adding && <AddForm onAdded={(p) => { upsert(p); setAdding(false); }} />}

      {/* 잔금 대기 목록 — 임박 먼저. */}
      <div className="rounded-card bg-surface p-4">
        <div className="mb-2 text-sm font-medium">잔금 대기</div>
        {pending.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-dim">대기 중인 잔금이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <Row key={p.id} p={p} today={today} onChange={upsert} onDelete={del} />
            ))}
          </ul>
        )}
      </div>

      {/* 완료분 — 기본 숨김. */}
      {paid.length > 0 && (
        <div className="rounded-card bg-surface p-4">
          <button onClick={() => setShowPaid((v) => !v)} className="text-xs text-text-dim">
            {showPaid ? "▾" : "▸"} 완료 {paid.length}건
          </button>
          {showPaid && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {paid.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate opacity-70">{p.name}</span>
                  <span className="text-xs text-text-dim">{p.balanceKrwActual != null ? won(p.balanceKrwActual) : "—"}</span>
                  <span className="text-[11px] text-text-dim">{p.paidAt?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ p, today, onChange, onDelete }: { p: Preorder; today: string; onChange: (p: Preorder) => void; onDelete: (id: number) => void }) {
  const [mode, setMode] = useState<"view" | "complete" | "edit">("view");
  const [actual, setActual] = useState(String(p.balanceKrwEstimate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const st = dueState(p.balanceDueDate, today);
  const dueCls = st === "overdue" ? "text-danger font-medium" : st === "soon" ? "text-accent" : "text-text-dim";

  async function complete() {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/preorders/${p.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ balanceKrwActual: Number(actual.replace(/[, ]/g, "")) || 0 }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.preorder) onChange(d.preorder);
    else setErr(d.error ?? "완료 실패");
  }

  return (
    <li className="rounded-control bg-surface-2 p-3 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
        <span className={`text-xs ${dueCls}`}>{p.balanceDueDate}{st === "overdue" ? " (초과)" : st === "soon" ? " (임박)" : ""}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-dim">
        <span>잔금 {p.balanceAmount != null ? cny(p.balanceAmount, p.currency) + " · " : ""}{won(p.balanceKrwEstimate)} 추정</span>
      </div>

      {mode === "view" && (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setMode("complete")} className="rounded-control bg-accent px-3 py-1 text-xs font-medium text-black">완료</button>
          <button onClick={() => setMode("edit")} className="rounded-control px-2 py-1 text-xs ring-1 ring-border">편집</button>
          <button onClick={() => onDelete(p.id)} className="ml-auto rounded-control px-2 py-1 text-xs text-text-dim hover:text-danger">삭제</button>
        </div>
      )}

      {mode === "complete" && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="text-[11px] text-text-dim">잔금 실제 지불 KRW (이 금액이 가계부 내역에 기록돼요)</label>
          <input inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={complete} className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50">{busy ? "기록 중…" : "확정"}</button>
            <button onClick={() => setMode("view")} className="rounded-control px-3 py-1.5 text-xs ring-1 ring-border">취소</button>
          </div>
          {err && <span className="text-xs text-danger">{err}</span>}
        </div>
      )}

      {mode === "edit" && <EditForm p={p} onSaved={(np) => { onChange(np); setMode("view"); }} onCancel={() => setMode("view")} />}
    </li>
  );
}

function EditForm({ p, onSaved, onCancel }: { p: Preorder; onSaved: (p: Preorder) => void; onCancel: () => void }) {
  const [name, setName] = useState(p.name);
  const [balCny, setBalCny] = useState(p.balanceAmount != null ? String(p.balanceAmount) : "");
  const [est, setEst] = useState(String(p.balanceKrwEstimate));
  const [due, setDue] = useState(p.balanceDueDate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fx = useFx(p.currency);
  const applyFx = () => {
    const n = Number(balCny.replace(/[, ]/g, "")) || 0;
    if (fx.data && n > 0) setEst(String(Math.round(n * fx.data.rate)));
  };

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/preorders/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || p.name,
        balanceAmount: balCny.trim() === "" ? null : Number(balCny.replace(/[, ]/g, "")),
        balanceKrwEstimate: Number(est.replace(/[, ]/g, "")) || 0,
        balanceDueDate: due,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.preorder) onSaved(d.preorder);
    else setErr(d.error ?? "저장 실패");
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="이름" />
      <div className="flex gap-2">
        <input inputMode="decimal" value={balCny} onChange={(e) => setBalCny(e.target.value)} className={inputCls} placeholder="잔금 CNY(선택)" />
        <input inputMode="numeric" value={est} onChange={(e) => setEst(e.target.value)} className={inputCls} placeholder="잔금 KRW 추정" />
      </div>
      <div className="flex items-center justify-between">
        <FxLine cur={p.currency} fx={fx} />
        {fx.data && (
          <button type="button" onClick={applyFx} className="shrink-0 rounded-control px-2 py-1 text-[11px] text-accent ring-1 ring-border">
            환율 적용
          </button>
        )}
      </div>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
        <button onClick={onCancel} className="rounded-control px-3 py-1.5 text-xs ring-1 ring-border">취소</button>
      </div>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: (p: Preorder) => void }) {
  const [name, setName] = useState("");
  const [depCny, setDepCny] = useState("");
  const [depKrw, setDepKrw] = useState("");
  const [depDate, setDepDate] = useState(todayKst());
  const [balCny, setBalCny] = useState("");
  const [balEst, setBalEst] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // KRW 칸을 사용자가 직접 손댔는지 — 손대기 전까진 CNY 변경마다 환율로 계속 재계산.
  const [depKrwTouched, setDepKrwTouched] = useState(false);
  const [balEstTouched, setBalEstTouched] = useState(false);
  const fx = useFx("CNY");
  const rate = fx.data?.rate ?? null;

  const numv = (s: string) => Number(s.replace(/[, ]/g, "")) || 0;
  // CNY 입력 시, 사용자가 KRW 칸을 직접 수정하기 전이면 매 입력마다 환율로 재계산(빈 값이면 비움).
  const onCny = (v: string, setCny: (s: string) => void, touched: boolean, setKrw: (s: string) => void) => {
    setCny(v);
    if (rate && !touched) {
      const n = numv(v);
      setKrw(n > 0 ? String(Math.round(n * rate)) : "");
    }
  };
  // 환율이 늦게 도착해도(비동기) 미수정 칸을 현재 CNY 기준으로 채움.
  useEffect(() => {
    if (rate == null) return;
    if (!depKrwTouched) { const n = numv(depCny); if (n > 0) setDepKrw(String(Math.round(n * rate))); }
    if (!balEstTouched) { const n = numv(balCny); if (n > 0) setBalEst(String(Math.round(n * rate))); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  async function submit() {
    if (!name.trim()) return setErr("상품/상점 이름을 입력하세요.");
    if (numv(depKrw) < 1) return setErr("보증금 실제 지불 KRW를 입력하세요.");
    if (!due) return setErr("잔금 예정일을 입력하세요.");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/preorders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        depositAmount: depCny.trim() === "" ? null : numv(depCny),
        depositKrw: numv(depKrw),
        depositDate: depDate,
        balanceAmount: balCny.trim() === "" ? null : numv(balCny),
        balanceKrwEstimate: numv(balEst),
        balanceDueDate: due,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && d.preorder) onAdded(d.preorder);
    else setErr(d.error ?? "추가 실패");
  }

  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="상품/상점" />
      <FxLine cur="CNY" fx={fx} />
      <div className="text-[11px] text-text-dim">보증금 (실제로 지금 나감 → 가계부 내역에 기록)</div>
      <div className="flex gap-2">
        <input inputMode="decimal" value={depCny} onChange={(e) => onCny(e.target.value, setDepCny, depKrwTouched, setDepKrw)} className={inputCls} placeholder="보증금 CNY(선택)" />
        <input inputMode="numeric" value={depKrw} onChange={(e) => { setDepKrw(e.target.value); setDepKrwTouched(true); }} className={inputCls} placeholder="보증금 실제 KRW *" />
      </div>
      <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} className={inputCls} />
      <div className="mt-1 text-[11px] text-text-dim">잔금 (아직 안 냄 → 대기 합계에만 표시)</div>
      <div className="flex gap-2">
        <input inputMode="decimal" value={balCny} onChange={(e) => onCny(e.target.value, setBalCny, balEstTouched, setBalEst)} className={inputCls} placeholder="잔금 CNY(선택)" />
        <input inputMode="numeric" value={balEst} onChange={(e) => { setBalEst(e.target.value); setBalEstTouched(true); }} className={inputCls} placeholder="잔금 KRW 추정" />
      </div>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="잔금 예정일" />
      <button disabled={busy} onClick={submit} className="rounded-control bg-accent px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
        {busy ? "추가 중…" : "예약 추가 (보증금 기록 + 리마인더)"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
