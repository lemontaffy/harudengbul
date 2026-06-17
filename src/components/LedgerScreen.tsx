"use client";

import { useState } from "react";
import LedgerView, { type Tx } from "@/components/LedgerView";
import PreordersView, { type Preorder } from "@/components/PreordersView";
import type { Summary } from "@/lib/txparse";

// 가계부 화면 — 상단 세그먼트로 [내역](실제 거래) / [예약·잔금](아직 갚을 돈) 전환.
//   두 숫자는 절대 안 섞임: 내역=진짜 나간 돈, 예약·잔금=대기 잔금.
export default function LedgerScreen({
  initialMonth,
  initialTxs,
  initialSummary,
  emptyCta,
  initialPreorders,
}: {
  initialMonth: string;
  initialTxs: Tx[];
  initialSummary: Summary;
  emptyCta?: { text: string; href: string };
  initialPreorders: Preorder[];
}) {
  const [tab, setTab] = useState<"ledger" | "preorders">("ledger");
  const pendingCount = initialPreorders.filter((p) => p.status === "pending").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["ledger", "내역"],
            ["preorders", pendingCount ? `예약·잔금 (${pendingCount})` : "예약·잔금"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-control px-2 py-2 text-sm ${
              tab === k ? "bg-accent text-black" : "bg-surface-2 ring-1 ring-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ledger" ? (
        <LedgerView
          initialMonth={initialMonth}
          initialTxs={initialTxs}
          initialSummary={initialSummary}
          emptyCta={emptyCta}
        />
      ) : (
        <PreordersView initial={initialPreorders} />
      )}
    </div>
  );
}
