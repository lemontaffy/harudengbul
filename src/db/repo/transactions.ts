import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../client";
import { transactions } from "../schema";

export type TransactionRow = typeof transactions.$inferSelect;

export async function create(
  userId: number,
  input: {
    txDate: string; // YYYY-MM-DD
    kind: "expense" | "income";
    category: string;
    amount: number; // KRW 정수
    memo?: string | null;
  },
) {
  const [row] = await db
    .insert(transactions)
    .values({
      userId,
      txDate: input.txDate,
      kind: input.kind,
      category: input.category,
      amount: input.amount,
      memo: input.memo ?? null,
    })
    .returning();
  return row;
}

/** 기간 내역(최신순) — 가계부 화면/집계용. */
export async function listBetween(userId: number, from: string, to: string) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.txDate, from),
        lte(transactions.txDate, to),
      ),
    )
    .orderBy(desc(transactions.txDate), desc(transactions.id));
}
