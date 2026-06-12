import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as txRepo from "@/db/repo/transactions";
import { summarize } from "@/lib/txparse";
import { grantGrowth } from "@/lib/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 해당 월 마지막 날
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function publicRow(r: txRepo.TransactionRow) {
  return {
    id: r.id,
    txDate: r.txDate,
    kind: r.kind,
    category: r.category,
    amount: r.amount,
    memo: r.memo,
  };
}

const createSchema = z.object({
  kind: z.enum(["expense", "income"]),
  category: z.string().trim().min(1).max(40),
  amount: z.number().int().min(1).max(1_000_000_000),
  memo: z.string().max(200).nullable().optional(),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const month = new URL(req.url).searchParams.get("month") ?? todayKst().slice(0, 7);
  if (!monthRe.test(month)) return Response.json({ error: "month 형식(YYYY-MM)" }, { status: 400 });
  const { from, to } = monthRange(month);
  const rows = await txRepo.listBetween(user.id, from, to);
  return Response.json({
    month,
    transactions: rows.map(publicRow),
    summary: summarize(rows),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;
  const row = await txRepo.create(user.id, {
    txDate: d.txDate ?? todayKst(),
    kind: d.kind,
    category: d.category,
    amount: d.amount,
    memo: d.memo ?? null,
  });
  void grantGrowth(user.id, 1).catch(() => {}); // 펫 성장 +1(일일 상한)
  return Response.json({ transaction: publicRow(row) });
}
