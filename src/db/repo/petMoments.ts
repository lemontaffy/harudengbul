import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../client";
import { petMoments, type MomentLine } from "../schema";

// 펫 관계 이벤트 '순간' — 같은 방 관계 두 펫의 씬(메인 모델 생성). userId 스코프.

export type PetMomentRow = typeof petMoments.$inferSelect;

export async function create(
  userId: number,
  input: {
    roomId: number;
    petAId: number;
    petBId: number;
    petAName: string;
    petBName: string;
    relationKind: "hostile" | "love";
    script: MomentLine[];
  },
) {
  const [row] = await db
    .insert(petMoments)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function getOne(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(petMoments)
    .where(and(eq(petMoments.id, id), eq(petMoments.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 순간 기록 목록(최신순). 뱃지·안읽음 카운트 없음 — 단순 보관함. */
export async function listForUser(userId: number, limit = 50) {
  return db
    .select()
    .from(petMoments)
    .where(eq(petMoments.userId, userId))
    .orderBy(desc(petMoments.createdAt))
    .limit(limit);
}

/** 하루 1회 캡 — since(사용자 tz 당일 자정) 이후 생성 수. */
export async function countSince(userId: number, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petMoments)
    .where(and(eq(petMoments.userId, userId), gte(petMoments.createdAt, since)));
  return r?.n ?? 0;
}

export async function markSeen(userId: number, id: number) {
  await db
    .update(petMoments)
    .set({ seenAt: new Date() })
    .where(and(eq(petMoments.id, id), eq(petMoments.userId, userId)));
}
