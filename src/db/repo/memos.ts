import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { memos } from "../schema";

export type MemoRow = typeof memos.$inferSelect;

export async function create(userId: number, content: string) {
  const [row] = await db.insert(memos).values({ userId, content }).returning();
  return row;
}

/** 미완료 — 최신순(캡처 인박스). 기한·우선순위 없음. */
export async function listOpen(userId: number, limit = 200) {
  return db
    .select()
    .from(memos)
    .where(and(eq(memos.userId, userId), eq(memos.done, false)))
    .orderBy(desc(memos.createdAt), desc(memos.id))
    .limit(limit);
}

/** 해치운 것 — done_at 내림차순. */
export async function listDone(userId: number, limit = 200) {
  return db
    .select()
    .from(memos)
    .where(and(eq(memos.userId, userId), eq(memos.done, true)))
    .orderBy(desc(memos.doneAt), desc(memos.id))
    .limit(limit);
}

export async function getOne(userId: number, id: number) {
  return db.query.memos.findFirst({
    where: and(eq(memos.id, id), eq(memos.userId, userId)),
  });
}

/** 체크/해제 — done_at 동기화. */
export async function setDone(userId: number, id: number, done: boolean) {
  await db
    .update(memos)
    .set({ done, doneAt: done ? new Date() : null })
    .where(and(eq(memos.id, id), eq(memos.userId, userId)));
}

/** 승격 핸드오프 승인 시 자동 체크(미완료였을 때만). */
export async function markDone(userId: number, id: number) {
  await db
    .update(memos)
    .set({ done: true, doneAt: new Date() })
    .where(and(eq(memos.id, id), eq(memos.userId, userId), eq(memos.done, false)));
}

export async function updateContent(userId: number, id: number, content: string) {
  await db
    .update(memos)
    .set({ content })
    .where(and(eq(memos.id, id), eq(memos.userId, userId)));
}

export async function remove(userId: number, id: number) {
  await db.delete(memos).where(and(eq(memos.id, id), eq(memos.userId, userId)));
}

export async function countOpen(userId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memos)
    .where(and(eq(memos.userId, userId), eq(memos.done, false)));
  return r?.n ?? 0;
}

/** 최근 7일간 해치운 수(긍정 집계 — 스트릭 아님). */
export async function weekDoneCount(userId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memos)
    .where(
      and(
        eq(memos.userId, userId),
        eq(memos.done, true),
        sql`${memos.doneAt} >= now() - interval '7 days'`,
      ),
    );
  return r?.n ?? 0;
}
