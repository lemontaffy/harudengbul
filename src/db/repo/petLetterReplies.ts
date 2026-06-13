import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../client";
import { petLetterReplies, petLetters, pets } from "../schema";

export type PetLetterReplyRow = typeof petLetterReplies.$inferSelect;

/** 받는 펫별 답장 예약(pending, deliver_at). */
export async function createPending(letterId: number, petId: number, deliverAt: Date) {
  const [row] = await db
    .insert(petLetterReplies)
    .values({ letterId, petId, deliverAt, status: "pending" })
    .returning();
  return row;
}

/** 워커 — 도착 시각 도래 & 아직 pending(전 사용자). 푸시/생성에 필요한 letter·pet 정보 동봉. */
export async function listAllDue() {
  return db
    .select({
      id: petLetterReplies.id,
      letterId: petLetterReplies.letterId,
      petId: petLetterReplies.petId,
      userId: petLetters.userId,
      letterContent: petLetters.content,
    })
    .from(petLetterReplies)
    .innerJoin(petLetters, eq(petLetters.id, petLetterReplies.letterId))
    .where(and(eq(petLetterReplies.status, "pending"), lte(petLetterReplies.deliverAt, sql`now()`)));
}

/**
 * 원자적 도착 청구 — pending → arrived, 동시에 content 를 폴백으로 채워 빈 답장 방지.
 * 청구되면 그 행, 이미 처리됐으면 null. 이후 실제 생성분으로 setContent 덮어씀.
 */
export async function claimArrival(id: number, fallback: string) {
  const [row] = await db
    .update(petLetterReplies)
    .set({ status: "arrived", content: fallback })
    .where(and(eq(petLetterReplies.id, id), eq(petLetterReplies.status, "pending")))
    .returning();
  return row ?? null;
}

export async function setContent(id: number, content: string) {
  await db.update(petLetterReplies).set({ content }).where(eq(petLetterReplies.id, id));
}

/** 보관함 — 도착한 답장(최신순) + 펫 이름. 소유 스코프(letter→user). */
export async function listForUser(userId: number) {
  return db
    .select({
      id: petLetterReplies.id,
      petId: petLetterReplies.petId,
      petName: pets.name,
      content: petLetterReplies.content,
      readAt: petLetterReplies.readAt,
      createdAt: petLetterReplies.createdAt,
      letterContent: petLetters.content,
    })
    .from(petLetterReplies)
    .innerJoin(petLetters, eq(petLetters.id, petLetterReplies.letterId))
    .leftJoin(pets, eq(pets.id, petLetterReplies.petId))
    .where(and(eq(petLetters.userId, userId), eq(petLetterReplies.status, "arrived")))
    .orderBy(desc(petLetterReplies.createdAt));
}

/** 안 읽은 도착 답장 수(우체통 active 판정). */
export async function countUnread(userId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petLetterReplies)
    .innerJoin(petLetters, eq(petLetters.id, petLetterReplies.letterId))
    .where(
      and(
        eq(petLetters.userId, userId),
        eq(petLetterReplies.status, "arrived"),
        isNull(petLetterReplies.readAt),
      ),
    );
  return r?.n ?? 0;
}

/** 읽음 기록 — 소유 확인(답장의 편지가 user 소유인지). */
export async function markRead(userId: number, id: number) {
  await db
    .update(petLetterReplies)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(petLetterReplies.id, id),
        sql`exists (select 1 from ${petLetters} where ${petLetters.id} = ${petLetterReplies.letterId} and ${petLetters.userId} = ${userId})`,
      ),
    );
}
