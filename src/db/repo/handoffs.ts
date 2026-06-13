import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { handoffSuggestions, personas } from "../schema";

/**
 * pending 핸드오프 생성(동의 후 suggest_handoff 도구에서). 같은 user의 동일 텍스트 pending이
 * 이미 있으면 중복 생성하지 않는다. 생성됐으면 true.
 */
export async function createPending(
  userId: number,
  sourcePersonaId: number | null,
  suggestedText: string,
  sourceMemoId: number | null = null,
): Promise<boolean> {
  const text = suggestedText.trim();
  if (!text) return false;
  const [dup] = await db
    .select({ id: handoffSuggestions.id })
    .from(handoffSuggestions)
    .where(
      and(
        eq(handoffSuggestions.userId, userId),
        eq(handoffSuggestions.status, "pending"),
        eq(handoffSuggestions.suggestedText, text),
      ),
    )
    .limit(1);
  if (dup) return false;
  await db
    .insert(handoffSuggestions)
    .values({ userId, sourcePersonaId, suggestedText: text, sourceMemoId });
  return true;
}

/** 홈 카드용 — pending 목록 + 전달한 캐릭터 이름. 최신순. */
export async function listPending(userId: number) {
  return db
    .select({
      id: handoffSuggestions.id,
      suggestedText: handoffSuggestions.suggestedText,
      sourcePersonaId: handoffSuggestions.sourcePersonaId,
      personaName: personas.name,
      createdAt: handoffSuggestions.createdAt,
    })
    .from(handoffSuggestions)
    .leftJoin(personas, eq(personas.id, handoffSuggestions.sourcePersonaId))
    .where(
      and(
        eq(handoffSuggestions.userId, userId),
        eq(handoffSuggestions.status, "pending"),
      ),
    )
    .orderBy(desc(handoffSuggestions.createdAt));
}

export async function getOne(userId: number, id: number) {
  return db.query.handoffSuggestions.findFirst({
    where: and(
      eq(handoffSuggestions.id, id),
      eq(handoffSuggestions.userId, userId),
    ),
  });
}

/** 승인 — 일정 생성 후 연결. pending 이던 것만 갱신. */
export async function accept(userId: number, id: number, eventId: number): Promise<boolean> {
  const res = await db
    .update(handoffSuggestions)
    .set({ status: "accepted", createdEventId: eventId, resolvedAt: new Date() })
    .where(
      and(
        eq(handoffSuggestions.id, id),
        eq(handoffSuggestions.userId, userId),
        eq(handoffSuggestions.status, "pending"),
      ),
    )
    .returning({ id: handoffSuggestions.id });
  return res.length > 0;
}

/** 넘기기(거절). */
export async function dismiss(userId: number, id: number): Promise<boolean> {
  const res = await db
    .update(handoffSuggestions)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(
      and(
        eq(handoffSuggestions.id, id),
        eq(handoffSuggestions.userId, userId),
        eq(handoffSuggestions.status, "pending"),
      ),
    )
    .returning({ id: handoffSuggestions.id });
  return res.length > 0;
}

/** 워커 — 14일 경과 pending 을 조용히 expired 로. 알림·표시 없음. 변경 건수 반환. */
export async function expireOld(): Promise<number> {
  const res = await db
    .update(handoffSuggestions)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(handoffSuggestions.status, "pending"),
        sql`${handoffSuggestions.createdAt} < now() - interval '14 days'`,
      ),
    )
    .returning({ id: handoffSuggestions.id });
  return res.length;
}
