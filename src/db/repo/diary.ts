import { and, asc, desc, eq, gt, gte, ilike, inArray, lte } from "drizzle-orm";
import { db } from "../client";
import { diaryEntries, diaryItems } from "../schema";

export type DiaryItemInput = {
  label: string;
  amount?: string | null;
  weight?: number | null;
};

/**
 * 하루 1편 — (user_id, entry_date) unique.
 * **부분 업데이트**: patch 에 제공된 키만 갱신한다(undefined 키는 건드리지 않음).
 * → 대시보드 기분 칩이 mood만 보내도 기존 본문이 지워지지 않는다.
 */
export async function upsertEntry(
  userId: number,
  entryDate: string,
  patch: {
    mood?: string | null;
    bodyCondition?: string | null;
    body?: string | null;
    photoPath?: string | null;
  },
) {
  const set: Partial<typeof diaryEntries.$inferInsert> = {};
  if (patch.mood !== undefined) set.mood = patch.mood;
  if (patch.bodyCondition !== undefined) set.bodyCondition = patch.bodyCondition;
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.photoPath !== undefined) set.photoPath = patch.photoPath;

  // 제공된 키가 없으면 쓰기 없이 현재 행 반환(없으면 빈 행 생성).
  if (Object.keys(set).length === 0) {
    return (
      (await getByDate(userId, entryDate)) ??
      (
        await db
          .insert(diaryEntries)
          .values({ userId, entryDate })
          .onConflictDoNothing()
          .returning()
      )[0] ??
      (await getByDate(userId, entryDate))!
    );
  }

  const [row] = await db
    .insert(diaryEntries)
    .values({
      userId,
      entryDate,
      mood: patch.mood ?? null,
      bodyCondition: patch.bodyCondition ?? null,
      body: patch.body ?? null,
      photoPath: patch.photoPath ?? null,
    })
    .onConflictDoUpdate({
      target: [diaryEntries.userId, diaryEntries.entryDate],
      set,
    })
    .returning();
  return row;
}

/** 서빙 화이트리스트 — 이 URL이 어떤 일기 사진으로 등록돼 있는지. */
export async function photoExists(url: string): Promise<boolean> {
  const [r] = await db
    .select({ id: diaryEntries.id })
    .from(diaryEntries)
    .where(eq(diaryEntries.photoPath, url))
    .limit(1);
  return !!r;
}

export async function getByDate(userId: number, entryDate: string) {
  return db.query.diaryEntries.findFirst({
    where: and(
      eq(diaryEntries.userId, userId),
      eq(diaryEntries.entryDate, entryDate),
    ),
  });
}

/** 소유권 확인 후 entry의 items 교체(전체 삭제 후 재삽입). */
export async function setItems(
  userId: number,
  entryId: number,
  items: DiaryItemInput[],
) {
  const owned = await db.query.diaryEntries.findFirst({
    where: and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, userId)),
  });
  if (!owned) return;
  await db.delete(diaryItems).where(eq(diaryItems.entryId, entryId));
  if (items.length > 0) {
    await db.insert(diaryItems).values(
      items.map((it) => ({
        entryId,
        label: it.label,
        amount: it.amount ?? null,
        weight: it.weight ?? null,
      })),
    );
  }
}

export async function getItems(entryId: number) {
  return db
    .select()
    .from(diaryItems)
    .where(eq(diaryItems.entryId, entryId))
    .orderBy(diaryItems.id);
}

/** 답장 저장 — 소유권 스코프. */
export async function setReply(
  userId: number,
  entryId: number,
  reply: string,
  personaName: string | null,
) {
  await db
    .update(diaryEntries)
    .set({ aiReply: reply, aiPersona: personaName })
    .where(and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, userId)));
}

/** memoryJob 용 — sinceId 이후 일기(오래된→최신, body 있는 것만). */
export async function listSinceId(userId: number, sinceId: number, limit = 50) {
  return db
    .select({
      id: diaryEntries.id,
      entryDate: diaryEntries.entryDate,
      mood: diaryEntries.mood,
      body: diaryEntries.body,
    })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), gt(diaryEntries.id, sinceId)))
    .orderBy(asc(diaryEntries.id))
    .limit(limit);
}

/** 기간 내 일기(오래된→최신) — 주간 회고 편지용. */
export async function listBetween(userId: number, from: string, to: string) {
  return db
    .select()
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        gte(diaryEntries.entryDate, from),
        lte(diaryEntries.entryDate, to),
      ),
    )
    .orderBy(asc(diaryEntries.entryDate));
}

/** 최신순 일기 목록(엔트리만). items 는 필요 시 getItems 로 별도 조회. */
export async function listByUser(userId: number, limit = 60) {
  return db
    .select()
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId))
    .orderBy(desc(diaryEntries.entryDate))
    .limit(limit);
}

/**
 * 검색/필터 + 페이지네이션(최신순). 일기 관리 화면용.
 *   q: 본문 부분일치(ILIKE), mood: 정확일치, from/to: entry_date 범위(YYYY-MM-DD).
 *   limit+1 을 떠서 hasMore 판정 후 limit 까지만 반환.
 */
export async function search(
  userId: number,
  opts: { q?: string; mood?: string; from?: string; to?: string; limit?: number; offset?: number },
): Promise<{ rows: (typeof diaryEntries.$inferSelect)[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conds = [eq(diaryEntries.userId, userId)];
  if (opts.q?.trim()) conds.push(ilike(diaryEntries.body, `%${opts.q.trim()}%`));
  if (opts.mood) conds.push(eq(diaryEntries.mood, opts.mood));
  if (opts.from) conds.push(gte(diaryEntries.entryDate, opts.from));
  if (opts.to) conds.push(lte(diaryEntries.entryDate, opts.to));

  const rows = await db
    .select()
    .from(diaryEntries)
    .where(and(...conds))
    .orderBy(desc(diaryEntries.entryDate))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * 그 날짜에 "일기를 썼다"고 볼 내용이 있는지 — 리마인드 스킵 판정용.
 *   mood/컨디션/본문/사진 중 하나라도, 또는 '오늘 한 일' 항목이 하나라도 있으면 true.
 *   (빈 행은 mood-only 호출 등으로 생길 수 있어 '행 존재'만으론 판정하지 않는다.)
 */
export async function hasContentOn(userId: number, date: string): Promise<boolean> {
  const e = await getByDate(userId, date);
  if (!e) return false;
  if (e.mood || e.bodyCondition || (e.body && e.body.trim()) || e.photoPath) return true;
  const [it] = await db
    .select({ id: diaryItems.id })
    .from(diaryItems)
    .where(eq(diaryItems.entryId, e.id))
    .limit(1);
  return !!it;
}

/** 여러 엔트리의 items 를 한 번에(N+1 회피). entryId → items 맵. */
export async function getItemsForEntries(entryIds: number[]) {
  const map = new Map<number, (typeof diaryItems.$inferSelect)[]>();
  if (entryIds.length === 0) return map;
  const rows = await db
    .select()
    .from(diaryItems)
    .where(inArray(diaryItems.entryId, entryIds))
    .orderBy(diaryItems.id);
  for (const r of rows) {
    if (r.entryId == null) continue;
    const arr = map.get(r.entryId) ?? [];
    arr.push(r);
    map.set(r.entryId, arr);
  }
  return map;
}
