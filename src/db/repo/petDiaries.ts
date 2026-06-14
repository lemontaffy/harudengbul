import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { petDiaries, pets } from "../schema";

export type PetDiaryRow = typeof petDiaries.$inferSelect;

/** 그날 펫 일기 — 펫 이름 동봉(아바타는 호출부에서 스프라이트로). 펫 생성순. */
export async function listByDate(userId: number, date: string) {
  return db
    .select({
      id: petDiaries.id,
      petId: petDiaries.petId,
      petName: pets.name,
      content: petDiaries.content,
      date: petDiaries.date,
    })
    .from(petDiaries)
    .innerJoin(pets, eq(pets.id, petDiaries.petId))
    .where(and(eq(petDiaries.userId, userId), eq(petDiaries.date, date)))
    .orderBy(pets.createdAt, pets.id);
}

/** 오늘치 이미 생성됐는지(1일 1회 판정). */
export async function existsForDate(userId: number, date: string): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petDiaries)
    .where(and(eq(petDiaries.userId, userId), eq(petDiaries.date, date)));
  return (r?.n ?? 0) > 0;
}

/** 5인분 한 번에 저장. 중복(같은 user·pet·date)은 무시 — 동시 생성 경합에도 1편 고정. */
export async function insertMany(
  rows: { userId: number; petId: number; content: string; date: string }[],
) {
  if (rows.length === 0) return;
  await db.insert(petDiaries).values(rows).onConflictDoNothing();
}

/** 아카이브 — 일기가 있는 날짜 목록(최신순). */
export async function listDates(userId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ date: petDiaries.date })
    .from(petDiaries)
    .where(eq(petDiaries.userId, userId))
    .orderBy(desc(petDiaries.date));
  return rows.map((r) => r.date);
}
