import { and, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { memories } from "../schema";
import { toVectorLiteral } from "@/lib/embeddings";

export type MemoryRow = typeof memories.$inferSelect;

// ── 회수 스코프 조건 ──
//  페르소나(노라·테오 등): 펫 추억은 제외(scope<>'pet'). 기존(legacy)·자기 영역은 그대로 본다.
//  펫(편지 답장 등): 그 펫이 쌓은 추억만(scope='pet' AND pet_id=X). 사적·메타·타 영역 기억 절대 미회수.
export const NON_PET: SQL = ne(memories.scope, "pet");
export function petScope(petId: number): SQL {
  return and(eq(memories.scope, "pet"), eq(memories.petId, petId)) as SQL;
}

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
export async function searchByEmbedding(
  userId: number,
  queryVec: number[],
  limit = 20,
  scopeCond: SQL = NON_PET,
) {
  const lit = toVectorLiteral(queryVec);
  return db
    .select(RECALL_COLS)
    .from(memories)
    .where(and(eq(memories.userId, userId), sql`${memories.embedding} IS NOT NULL`, scopeCond))
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
export async function getForPrompt(userId: number, limit = 20, scopeCond: SQL = NON_PET) {
  return db
    .select(RECALL_COLS)
    .from(memories)
    .where(and(eq(memories.userId, userId), scopeCond))
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit);
}

export async function add(
  userId: number,
  content: string,
  source: string, // 'chat' | 'diary' | 'pet_letter' 등
  importance = 3,
  opts?: { scope?: string; petId?: number },
) {
  const [row] = await db
    .insert(memories)
    .values({
      userId,
      content,
      source,
      importance,
      scope: opts?.scope ?? "chat", // 새 기억 기본 비-펫 스코프(펫은 명시적으로 'pet' 지정)
      petId: opts?.petId ?? null,
    })
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
