import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { letters } from "../schema";

export type LetterRow = typeof letters.$inferSelect;

export async function getByWeek(userId: number, weekStart: string) {
  return db.query.letters.findFirst({
    where: and(eq(letters.userId, userId), eq(letters.weekStart, weekStart)),
  });
}

export async function getOne(userId: number, id: number) {
  return db.query.letters.findFirst({
    where: and(eq(letters.id, id), eq(letters.userId, userId)),
  });
}

export async function listByUser(userId: number, limit = 60) {
  return db
    .select()
    .from(letters)
    .where(eq(letters.userId, userId))
    .orderBy(desc(letters.weekStart))
    .limit(limit);
}

/** 주(week_start) 기준 upsert — 같은 주 재생성 시 본문 갱신. */
export async function upsert(
  userId: number,
  input: {
    weekStart: string;
    weekEnd: string;
    personaName: string | null;
    body: string;
  },
) {
  const [row] = await db
    .insert(letters)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: [letters.userId, letters.weekStart],
      set: { body: input.body, personaName: input.personaName, weekEnd: input.weekEnd },
    })
    .returning();
  return row;
}
