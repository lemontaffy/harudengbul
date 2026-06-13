import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { petLetters } from "../schema";

export type PetLetterRow = typeof petLetters.$inferSelect;

export async function create(userId: number, toPetId: number | null, content: string) {
  const [row] = await db
    .insert(petLetters)
    .values({ userId, toPetId, content })
    .returning();
  return row;
}

export async function getOne(userId: number, id: number) {
  return db.query.petLetters.findFirst({
    where: and(eq(petLetters.id, id), eq(petLetters.userId, userId)),
  });
}

/** 사용자 tz 기준 '오늘' 보낸 편지 수 — 1일 상한 판정용(자정 경계는 Postgres AT TIME ZONE 로). */
export async function countToday(userId: number, tz: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petLetters)
    .where(
      and(
        eq(petLetters.userId, userId),
        sql`(${petLetters.sentAt} AT TIME ZONE ${tz})::date = (now() AT TIME ZONE ${tz})::date`,
      ),
    );
  return r?.n ?? 0;
}
