import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { itemGives, items } from "../schema";

// 아이템 '주기' 로그 — (펫×아이템) 쿨다운 영속 + 브리핑용 최근 지급.

/** 이 (펫×아이템)의 마지막 지급 시각(없으면 null). 쿨다운 판정용. */
export async function lastGiveAt(
  userId: number,
  petId: number,
  itemId: number,
): Promise<Date | null> {
  const [row] = await db
    .select({ givenAt: itemGives.givenAt })
    .from(itemGives)
    .where(
      and(eq(itemGives.userId, userId), eq(itemGives.petId, petId), eq(itemGives.itemId, itemId)),
    )
    .orderBy(desc(itemGives.givenAt))
    .limit(1);
  return row?.givenAt ?? null;
}

export async function log(userId: number, petId: number, itemId: number) {
  await db.insert(itemGives).values({ userId, petId, itemId });
}

/** 최근 지급한 아이템 이름들(브리핑 가벼운 노출용). 중복 제거 최신순. */
export async function recentItemNames(userId: number, limit = 3): Promise<string[]> {
  const rows = await db
    .select({ name: items.name, last: sql<string>`max(${itemGives.givenAt})` })
    .from(itemGives)
    .innerJoin(items, eq(items.id, itemGives.itemId))
    .where(eq(itemGives.userId, userId))
    .groupBy(items.name)
    .orderBy(desc(sql`max(${itemGives.givenAt})`))
    .limit(limit);
  return rows.map((r) => r.name);
}
