import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { diaryEntries, diaryItems } from "../schema";

export type DiaryItemInput = {
  label: string;
  amount?: string | null;
  weight?: number | null;
};

/** 하루 1편 — (user_id, entry_date) unique. 있으면 본문/기분 갱신, 없으면 생성. */
export async function upsertEntry(
  userId: number,
  entryDate: string,
  patch: { mood?: string | null; body?: string | null },
) {
  const [row] = await db
    .insert(diaryEntries)
    .values({
      userId,
      entryDate,
      mood: patch.mood ?? null,
      body: patch.body ?? null,
    })
    .onConflictDoUpdate({
      target: [diaryEntries.userId, diaryEntries.entryDate],
      set: { mood: patch.mood ?? null, body: patch.body ?? null },
    })
    .returning();
  return row;
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

/** 최신순 일기 목록(엔트리만). items 는 필요 시 getItems 로 별도 조회. */
export async function listByUser(userId: number, limit = 60) {
  return db
    .select()
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId))
    .orderBy(desc(diaryEntries.entryDate))
    .limit(limit);
}
