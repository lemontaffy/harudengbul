"use client";

import { useState } from "react";
import DonutChart, { DONUT_COLORS, type DonutSegment } from "@/components/DonutChart";
import { summarize, type Summary } from "@/lib/txparse";

export interface Tx {
  id: number;
  txDate: string;
  kind: "expense" | "income";
  category: string;
  amount: number;
  memo: string | null;
}

const inputCls =
  "w-full rounded-control bg-bg px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-accent";

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${y}년 ${Number(mo)}월`;
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function donutSegments(s: Summary): DonutSegment[] {
  const top = s.byCategory.slice(0, 6);
  const restSum = s.byCategory.slice(6).reduce((a, c) => a + c.amount, 0);
  const segs = top.map((c, i) => ({
    label: c.category,
    value: c.amount,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  if (restSum > 0) segs.push({ label: "기타", value: restSum, color: DONUT_COLORS[6] });
  return segs;
}

export default function LedgerView({
  initialMonth,
  initialTxs,
  initialSummary,
  emptyCta,
}: {
  initialMonth: string;
  initialTxs: Tx[];
  initialSummary: Summary;
  emptyCta?: { text: string; href: string };
}) {
  const [month, setMonth] = useState(initialMonth);
  const [txs, setTxs] = useState<Tx[]>(initialTxs);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [quick, setQuick] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  function recompute(next: Tx[]) {
    setTxs(next);
    setSummary(summarize(next));
  }

  async function loadMonth(m: string) {
    setMonth(m);
    setStatus("");
    const res = await fetch(`/api/transactions?month=${m}`);
    if (res.ok) {
      const d = await res.json();
      setTxs(d.transactions);
      setSummary(d.summary);
    }
  }

  async function quickAdd() {
    const text = quick.trim();
    if (!text || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/transactions/quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setStatus(d.error ?? "기록 실패");
        return;
      }
      setQuick("");
      // 이번 달이면 목록 갱신, 아니면 안내만
      if (d.transaction.txDate.slice(0, 7) === month) recompute([d.transaction, ...txs]);
      setStatus(`기록됨: ${d.transaction.category} ${won(d.transaction.amount)}`);
    } catch {
      setStatus("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) recompute(txs.filter((t) => t.id !== id));
  }

  const segs = donutSegments(summary);

  return (
    <div className="flex flex-col gap-4">
      {/* 월 이동 */}
      <div className="flex items-center justify-between">
        <button onClick={() => loadMonth(shiftMonth(month, -1))} className="px-2 text-sm opacity-60 hover:opacity-100">‹ 이전</button>
        <span className="text-sm font-semibold">{monthLabel(month)}</span>
        <button onClick={() => loadMonth(shiftMonth(month, 1))} className="px-2 text-sm opacity-60 hover:opacity-100">다음 ›</button>
      </div>

      {/* 요약 + 도넛 */}
      <section className="flex items-center gap-4 rounded-card bg-surface p-4">
        <DonutChart segments={segs} centerLabel={won(summary.expense)} />
        <div className="flex-1 text-sm">
          <div className="mb-2">
            <div className="text-xs opacity-50">지출</div>
            <div className="font-display font-semibold">{won(summary.expense)}</div>
          </div>
          <div className="mb-3">
            <div className="text-xs opacity-50">수입</div>
            <div className="font-display font-semibold text-accent">{won(summary.income)}</div>
          </div>
          <ul className="flex flex-col gap-1">
            {segs.slice(0, 4).map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="opacity-70">{s.label}</span>
                <span className="ml-auto opacity-50">{won(s.value)}</span>
              </li>
            ))}
            {segs.length === 0 && <li className="text-[11px] opacity-40">지출 없음</li>}
          </ul>
        </div>
      </section>

      {/* 빠른 입력 */}
      <section className="rounded-card bg-surface p-4">
        <div className="flex items-end gap-2">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder='예: "점심 9천원", "택시 1만2천", "월급 300만원"'
            className={inputCls}
          />
          <button
            onClick={quickAdd}
            disabled={busy || !quick.trim()}
            className="shrink-0 rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            기록
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] opacity-60">{status}</span>
          <button onClick={() => setAdding((v) => !v)} className="text-[11px] text-accent">
            {adding ? "닫기" : "직접 입력"}
          </button>
        </div>
        {adding && (
          <ManualForm
            month={month}
            onAdded={(tx) => {
              if (tx.txDate.slice(0, 7) === month) recompute([tx, ...txs]);
              setAdding(false);
            }}
          />
        )}
      </section>

      {/* 내역 */}
      <section className="rounded-card bg-surface p-4">
        <h2 className="font-display mb-2 text-sm font-semibold">내역</h2>
        {txs.length === 0 ? (
          emptyCta ? (
            <a
              href={emptyCta.href}
              className="flex items-center gap-1 py-1 text-xs text-accent hover:text-accent"
            >
              {emptyCta.text} <span aria-hidden>→</span>
            </a>
          ) : (
            <p className="text-xs opacity-40">이 달 내역이 없어요.</p>
          )
        ) : (
          <ul className="flex flex-col gap-1.5">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-[11px] opacity-50">{t.txDate.slice(5)}</span>
                <span className="truncate">{t.category}</span>
                {t.memo && <span className="truncate text-[11px] opacity-40">· {t.memo}</span>}
                <span className={`ml-auto shrink-0 ${t.kind === "income" ? "text-accent" : ""}`}>
                  {t.kind === "income" ? "+" : "-"}
                  {won(t.amount)}
                </span>
                <button onClick={() => del(t.id)} className="shrink-0 px-1 text-xs opacity-30 hover:text-red-400">✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ManualForm({ month, onAdded }: { month: string; onAdded: (tx: Tx) => void }) {
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(`${month}-01`);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const amt = Number(amount.replace(/[,\s]/g, ""));
    if (!category.trim() || !Number.isFinite(amt) || amt < 1) {
      setErr("카테고리와 금액을 확인하세요.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, category: category.trim(), amount: Math.round(amt), memo: memo.trim() || null, txDate: date }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? "저장 실패");
        return;
      }
      onAdded(d.transaction);
    } catch {
      setErr("네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex gap-2">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 rounded-control px-3 py-1.5 text-xs ${kind === k ? "bg-accent text-black" : "bg-bg ring-1 ring-border"}`}
          >
            {k === "expense" ? "지출" : "수입"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="카테고리" className={inputCls} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="금액(원)" className={inputCls} />
      </div>
      <div className="flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(선택)" className={inputCls} />
      </div>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      <button onClick={save} disabled={saving} className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
        {saving ? "저장 중…" : "추가"}
      </button>
    </div>
  );
}
