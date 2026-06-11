import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { memories } from "../schema";

/**
 * 프롬프트 주입용 — 반드시 해당 user_id 것만. (DELTA §5 격리 핵심)
 * v1: importance desc, created_at desc 상위 N개.
 */
export async function getForPrompt(userId: number, limit = 20) {
  return db
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit);
}

export async function add(
  userId: number,
  content: string,
  source: "chat" | "diary",
  importance = 3,
) {
  const [row] = await db
    .insert(memories)
    .values({ userId, content, source, importance })
    .returning();
  return row;
}

/** 중복 방지(라이트) — 같은 내용이 이미 있으면 true. 대소문자/공백 무시. */
export async function existsContent(userId: number, content: string): Promise<boolean> {
  const norm = content.trim().toLowerCase();
  const [row] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.userId, userId),
        sql`lower(trim(${memories.content})) = ${norm}`,
      ),
    )
    .limit(1);
  return !!row;
}
