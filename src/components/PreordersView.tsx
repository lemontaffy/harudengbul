"use client";

import { useMemo, useState } from "react";

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

  const numv = (s: string) => Number(s.replace(/[, ]/g, "")) || 0;

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
      <div className="text-[11px] text-text-dim">보증금 (실제로 지금 나감 → 가계부 내역에 기록)</div>
      <div className="flex gap-2">
        <input inputMode="decimal" value={depCny} onChange={(e) => setDepCny(e.target.value)} className={inputCls} placeholder="보증금 CNY(선택)" />
        <input inputMode="numeric" value={depKrw} onChange={(e) => setDepKrw(e.target.value)} className={inputCls} placeholder="보증금 실제 KRW *" />
      </div>
      <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} className={inputCls} />
      <div className="mt-1 text-[11px] text-text-dim">잔금 (아직 안 냄 → 대기 합계에만 표시)</div>
      <div className="flex gap-2">
        <input inputMode="decimal" value={balCny} onChange={(e) => setBalCny(e.target.value)} className={inputCls} placeholder="잔금 CNY(선택)" />
        <input inputMode="numeric" value={balEst} onChange={(e) => setBalEst(e.target.value)} className={inputCls} placeholder="잔금 KRW 추정" />
      </div>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="잔금 예정일" />
      <button disabled={busy} onClick={submit} className="rounded-control bg-accent px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
        {busy ? "추가 중…" : "예약 추가 (보증금 기록 + 리마인더)"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
