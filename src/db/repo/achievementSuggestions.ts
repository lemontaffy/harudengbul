import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { achievementSuggestions, personas } from "../schema";

/**
 * pending 업적 후보 생성(동의 후 suggest_achievement 도구에서). 같은 user의 동일 텍스트 pending이
 * 이미 있으면 중복 생성하지 않는다. 생성됐으면 true.
 */
export async function createPending(
  userId: number,
  sourcePersonaId: number | null,
  suggestedText: string,
): Promise<boolean> {
  const text = suggestedText.trim();
  if (!text) return false;
  const [dup] = await db
    .select({ id: achievementSuggestions.id })
    .from(achievementSuggestions)
    .where(
      and(
        eq(achievementSuggestions.userId, userId),
        eq(achievementSuggestions.status, "pending"),
        eq(achievementSuggestions.suggestedText, text),
      ),
    )
    .limit(1);
  if (dup) return false;
  await db
    .insert(achievementSuggestions)
    .values({ userId, sourcePersonaId, suggestedText: text });
  return true;
}

/** 홈 카드용 — pending 목록 + 짚어준 캐릭터 이름. 최신순. */
export async function listPending(userId: number) {
  return db
    .select({
      id: achievementSuggestions.id,
      suggestedText: achievementSuggestions.suggestedText,
      sourcePersonaId: achievementSuggestions.sourcePersonaId,
      personaName: personas.name,
      createdAt: achievementSuggestions.createdAt,
    })
    .from(achievementSuggestions)
    .leftJoin(personas, eq(personas.id, achievementSuggestions.sourcePersonaId))
    .where(
      and(eq(achievementSuggestions.userId, userId), eq(achievementSuggestions.status, "pending")),
    )
    .orderBy(desc(achievementSuggestions.createdAt));
}

export async function getOne(userId: number, id: number) {
  return db.query.achievementSuggestions.findFirst({
    where: and(eq(achievementSuggestions.id, id), eq(achievementSuggestions.userId, userId)),
  });
}

/** 승인 — 업적판 등록 후 연결. pending 이던 것만 갱신. */
export async function accept(userId: number, id: number, achievementId: number): Promise<boolean> {
  const res = await db
    .update(achievementSuggestions)
    .set({ status: "accepted", createdAchievementId: achievementId, resolvedAt: new Date() })
    .where(
      and(
        eq(achievementSuggestions.id, id),
        eq(achievementSuggestions.userId, userId),
        eq(achievementSuggestions.status, "pending"),
      ),
    )
    .returning({ id: achievementSuggestions.id });
  return res.length > 0;
}

/** 넘기기(거절). */
export async function dismiss(userId: number, id: number): Promise<boolean> {
  const res = await db
    .update(achievementSuggestions)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(
      and(
        eq(achievementSuggestions.id, id),
        eq(achievementSuggestions.userId, userId),
        eq(achievementSuggestions.status, "pending"),
      ),
    )
    .returning({ id: achievementSuggestions.id });
  return res.length > 0;
}

/** 워커 — 14일 경과 pending 을 조용히 expired 로. 알림·표시 없음. 변경 건수 반환. */
export async function expireOld(): Promise<number> {
  const res = await db
    .update(achievementSuggestions)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(achievementSuggestions.status, "pending"),
        sql`${achievementSuggestions.createdAt} < now() - interval '14 days'`,
      ),
    )
    .returning({ id: achievementSuggestions.id });
  return res.length;
}
