import { desc, eq, and } from "drizzle-orm";
import { db } from "../client";
import { achievements } from "../schema";

export type AchievementRow = typeof achievements.$inferSelect;

export async function create(userId: number, title: string, sourcePersonaId: number | null) {
  const [row] = await db
    .insert(achievements)
    .values({ userId, title: title.trim(), sourcePersonaId })
    .returning();
  return row;
}

/** 업적판 — 사용자 업적 전체(최신순). */
export async function listForUser(userId: number) {
  return db
    .select()
    .from(achievements)
    .where(eq(achievements.userId, userId))
    .orderBy(desc(achievements.createdAt), desc(achievements.id));
}

export async function remove(userId: number, id: number) {
  await db.delete(achievements).where(and(eq(achievements.id, id), eq(achievements.userId, userId)));
}
