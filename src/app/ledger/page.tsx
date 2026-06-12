import { requireUser } from "@/lib/currentUser";
import * as txRepo from "@/db/repo/transactions";
import { summarize } from "@/lib/txparse";
import LedgerView, { type Tx } from "@/components/LedgerView";

export const dynamic = "force-dynamic";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export default async function LedgerPage() {
  const user = await requireUser();
  const month = todayKst().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const rows = await txRepo.listBetween(
    user.id,
    `${month}-01`,
    `${month}-${String(last).padStart(2, "0")}`,
  );
  const txs: Tx[] = rows.map((r) => ({
    id: r.id,
    txDate: r.txDate,
    kind: r.kind as "expense" | "income",
    category: r.category,
    amount: r.amount,
    memo: r.memo,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">가계부</h1>
      </div>
      <LedgerView initialMonth={month} initialTxs={txs} initialSummary={summarize(rows)} />
    </main>
  );
}
