import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../client";
import { timeCapsules } from "../schema";

export type TimeCapsuleRow = typeof timeCapsules.$inferSelect;

export async function create(
  userId: number,
  v: { personaId: number | null; content: string; deliverOn: string },
) {
  const [row] = await db
    .insert(timeCapsules)
    .values({ userId, personaId: v.personaId, content: v.content, deliverOn: v.deliverOn })
    .returning();
  return row;
}

/** 사용자 전체 캡슐(최신순). 봉인 원칙상 content 노출 여부는 호출부(SSR)가 판단. */
export async function listForUser(userId: number) {
  return db
    .select()
    .from(timeCapsules)
    .where(eq(timeCapsules.userId, userId))
    .orderBy(desc(timeCapsules.createdAt));
}

export async function getOne(userId: number, id: number) {
  return db.query.timeCapsules.findFirst({
    where: and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId)),
  });
}

/** 재열기 수정 — 미배달 건만(라우트가 5분 창도 강제). */
export async function update(
  userId: number,
  id: number,
  patch: { content?: string; deliverOn?: string; personaId?: number | null },
) {
  await db
    .update(timeCapsules)
    .set(patch)
    .where(
      and(
        eq(timeCapsules.id, id),
        eq(timeCapsules.userId, userId),
        isNull(timeCapsules.deliveredAt),
      ),
    );
}

export async function remove(userId: number, id: number) {
  await db
    .delete(timeCapsules)
    .where(and(eq(timeCapsules.id, id), eq(timeCapsules.userId, userId)));
}

/** 워커 — 도착일 도래 & 미배달(전 사용자). */
export async function listAllDue() {
  return db
    .select()
    .from(timeCapsules)
    .where(
      and(isNull(timeCapsules.deliveredAt), lte(timeCapsules.deliverOn, sql`CURRENT_DATE`)),
    )
    .orderBy(asc(timeCapsules.deliverOn));
}

/** 원자적 배달 청구 — 중복 배달 방지. 청구되면 그 행, 이미 배달됐으면 null. */
export async function claimDelivery(id: number) {
  const [row] = await db
    .update(timeCapsules)
    .set({ deliveredAt: new Date() })
    .where(and(eq(timeCapsules.id, id), isNull(timeCapsules.deliveredAt)))
    .returning();
  return row ?? null;
}
