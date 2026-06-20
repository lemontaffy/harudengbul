import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
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

/**
 * 통합 검색용 — 내용 ILIKE(부분일치) 우선, 부족하면 트라이그램 유사도 보조. userId 스코프.
 * 선택 필터: 기간(createdAt). 완료/미완료 모두 포함. 최신순.
 */
export async function search(
  userId: number,
  query: string,
  opts: { from?: Date; to?: Date; limit?: number } = {},
): Promise<MemoRow[]> {
  const q = query.trim();
  const limit = opts.limit ?? 30;
  if (!q || limit <= 0) return [];

  const scope = [eq(memos.userId, userId)];
  if (opts.from) scope.push(gte(memos.createdAt, opts.from));
  if (opts.to) scope.push(lte(memos.createdAt, opts.to));

  const exact = await db
    .select()
    .from(memos)
    .where(and(...scope, ilike(memos.content, `%${q}%`)))
    .orderBy(desc(memos.createdAt))
    .limit(limit);
  if (exact.length >= limit) return exact;

  const seen = new Set(exact.map((r) => r.id));
  const sim = sql<number>`similarity(${memos.content}, ${q})`;
  const fuzzy = await db
    .select()
    .from(memos)
    .where(and(...scope, sql`${sim} > 0.1`))
    .orderBy(desc(sim), desc(memos.createdAt))
    .limit(limit * 3);
  const extra = fuzzy.filter((r) => !seen.has(r.id)).slice(0, limit - exact.length);
  return [...exact, ...extra];
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

/**
 * 완료(done) 주머니메모 정리 — 완료 시각(없으면 생성 시각)이 cutoff 이전인 것 삭제.
 * 주간 결산 잡이 '이번 주 월요일 0시'를 cutoff로 넘긴다: 주 경계(일→월 자정)를 넘기면
 * 지난 주에 해치운 메모를 일괄 비운다(타임스탬프상 며칠 지났든). 이번 주 완료분은 보존.
 * 미완료 메모와 주간 회고 편지는 안 건드림. 반환: 삭제 수.
 */
export async function purgeDoneBefore(userId: number, cutoff: Date): Promise<number> {
  const res = await db
    .delete(memos)
    .where(
      and(
        eq(memos.userId, userId),
        eq(memos.done, true),
        sql`coalesce(${memos.doneAt}, ${memos.createdAt}) < ${cutoff}`,
      ),
    )
    .returning({ id: memos.id });
  return res.length;
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
