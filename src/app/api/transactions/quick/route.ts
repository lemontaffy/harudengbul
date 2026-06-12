import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as txRepo from "@/db/repo/transactions";
import { parseQuickTx } from "@/lib/txparse";
import { grantGrowth } from "@/lib/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().min(1).max(200) });

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// "점심 9천원" 같은 자연어 한 줄 → 거래 기록.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const tx = parseQuickTx(parsed.data.text);
  if (!tx) {
    return Response.json(
      { error: "금액을 인식하지 못했어요. 예: \"점심 9천원\"" },
      { status: 400 },
    );
  }
  const row = await txRepo.create(user.id, {
    txDate: todayKst(),
    kind: tx.kind,
    category: tx.category,
    amount: tx.amount,
    memo: tx.memo,
  });
  void grantGrowth(user.id, 1).catch(() => {}); // 펫 성장 +1(일일 상한)
  return Response.json({
    transaction: {
      id: row.id,
      txDate: row.txDate,
      kind: row.kind,
      category: row.category,
      amount: row.amount,
      memo: row.memo,
    },
  });
}
