import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { preorders } from "../schema";

// 예약·잔금 추적 — userId 스코프. 가계부 거래(transactions)와 분리: 여기 금액은 '아직 갚을 돈',
//   실제 나간 돈은 transactions 에 별도로 기록하고 그 id 만 연결(deposit_txn_id/balance_txn_id).

export type PreorderRow = typeof preorders.$inferSelect;

export async function create(
  userId: number,
  input: {
    name: string;
    currency?: string;
    depositAmount?: string | null; // CNY (numeric → string)
    depositKrw: number;
    depositDate: string; // YYYY-MM-DD
    balanceAmount?: string | null; // CNY
    balanceKrwEstimate: number;
    balanceDueDate: string; // YYYY-MM-DD
    depositTxnId?: number | null;
    reminderId?: number | null;
  },
): Promise<PreorderRow> {
  const [row] = await db
    .insert(preorders)
    .values({
      userId,
      name: input.name,
      currency: input.currency ?? "CNY",
      depositAmount: input.depositAmount ?? null,
      depositKrw: input.depositKrw,
      depositDate: input.depositDate,
      balanceAmount: input.balanceAmount ?? null,
      balanceKrwEstimate: input.balanceKrwEstimate,
      balanceDueDate: input.balanceDueDate,
      depositTxnId: input.depositTxnId ?? null,
      reminderId: input.reminderId ?? null,
    })
    .returning();
  return row;
}

/** 목록 — status 필터(미지정=전체). 잔금 예정일 오름차순(임박 먼저). */
export async function listByUser(userId: number, status?: "pending" | "paid"): Promise<PreorderRow[]> {
  const where = status
    ? and(eq(preorders.userId, userId), eq(preorders.status, status))
    : eq(preorders.userId, userId);
  return db.select().from(preorders).where(where).orderBy(asc(preorders.balanceDueDate), asc(preorders.id));
}

export async function getOne(userId: number, id: number): Promise<PreorderRow | undefined> {
  const [row] = await db
    .select()
    .from(preorders)
    .where(and(eq(preorders.id, id), eq(preorders.userId, userId)))
    .limit(1);
  return row;
}

/** 편집 — 잔금 예정일·금액·KRW추정 등(pending 동안). 거래/리마인더 갱신은 호출부. */
export async function update(
  userId: number,
  id: number,
  patch: {
    name?: string;
    balanceAmount?: string | null;
    balanceKrwEstimate?: number;
    balanceDueDate?: string;
  },
): Promise<void> {
  await db.update(preorders).set(patch).where(and(eq(preorders.id, id), eq(preorders.userId, userId)));
}

/** 잔금 완료 — 실제 KRW·잔금 거래 id 연결, status=paid, paid_at=now. */
export async function markPaid(
  userId: number,
  id: number,
  input: { balanceKrwActual: number; balanceTxnId: number; paidAt: Date },
): Promise<void> {
  await db
    .update(preorders)
    .set({
      balanceKrwActual: input.balanceKrwActual,
      balanceTxnId: input.balanceTxnId,
      status: "paid",
      paidAt: input.paidAt,
    })
    .where(and(eq(preorders.id, id), eq(preorders.userId, userId)));
}

export async function remove(userId: number, id: number): Promise<void> {
  await db.delete(preorders).where(and(eq(preorders.id, id), eq(preorders.userId, userId)));
}
