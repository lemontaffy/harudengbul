import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { memories } from "../schema";
import { toVectorLiteral } from "@/lib/embeddings";

export type MemoryRow = typeof memories.$inferSelect;

// 회수 시 임베딩(1536 float)은 제외 — 컨텍스트 주입엔 content만 필요.
const RECALL_COLS = {
  id: memories.id,
  content: memories.content,
  source: memories.source,
  importance: memories.importance,
  createdAt: memories.createdAt,
};

/** 임베딩 저장(생성 후). */
export async function setEmbedding(userId: number, id: number, vec: number[]) {
  const lit = toVectorLiteral(vec);
  await db
    .update(memories)
    .set({ embedding: sql`${lit}::vector` })
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

/**
 * 의미 검색 — 질의 벡터에 코사인 가까운 순. 임베딩 있는 것만. (DELTA §5 격리: user_id 스코프)
 * 결과 없으면 빈 배열 → 호출부가 importance 폴백.
 */
export async function searchByEmbedding(userId: number, queryVec: number[], limit = 20) {
  const lit = toVectorLiteral(queryVec);
  return db
    .select(RECALL_COLS)
    .from(memories)
    .where(and(eq(memories.userId, userId), sql`${memories.embedding} IS NOT NULL`))
    .orderBy(sql`${memories.embedding} <=> ${lit}::vector`)
    .limit(limit);
}

/** 아직 임베딩 안 된 기억(백필용). */
export async function listMissingEmbedding(userId: number, limit = 20) {
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, userId), isNull(memories.embedding)))
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

/**
 * 프롬프트 주입용 — 반드시 해당 user_id 것만. (DELTA §5 격리 핵심)
 * v1: importance desc, created_at desc 상위 N개.
 */
export async function getForPrompt(userId: number, limit = 20) {
  return db
    .select(RECALL_COLS)
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
