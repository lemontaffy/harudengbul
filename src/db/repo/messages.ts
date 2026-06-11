import { and, asc, count, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "../client";
import { messages } from "../schema";

export type MsgRole = "user" | "assistant" | "proactive";

export async function add(
  userId: number,
  personaId: number,
  role: MsgRole,
  content: string,
) {
  const [row] = await db
    .insert(messages)
    .values({ userId, personaId, role, content })
    .returning();
  return row;
}

/** 화면용 — 캐릭터별 스레드, 오래된→최신 순. */
export async function listForView(
  userId: number,
  personaId: number,
  limit = 100,
) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** 대시보드 미리보기용 — 그 스레드 최신 1건. */
export async function lastMessage(userId: number, personaId: number) {
  const [row] = await db
    .select({
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return row ?? null;
}

/** 안읽음 수 — lastReadAt 이후의 assistant/proactive 메시지. null이면 전체. */
export async function countUnread(
  userId: number,
  personaId: number,
  lastReadAt: Date | null,
): Promise<number> {
  const conds = [
    eq(messages.userId, userId),
    eq(messages.personaId, personaId),
    inArray(messages.role, ["assistant", "proactive"]),
  ];
  if (lastReadAt) conds.push(gt(messages.createdAt, lastReadAt));
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(...conds));
  return row?.n ?? 0;
}

/** memoryJob 용 — sinceId 이후 메시지(오래된→최신). 토큰 한도 위해 limit. */
export async function listSinceId(userId: number, sinceId: number, limit = 200) {
  return db
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, userId), gt(messages.id, sinceId)))
    .orderBy(asc(messages.id))
    .limit(limit);
}

/** 프롬프트용 — 최근 N턴(role/content만), 오래된→최신. */
export async function listForPrompt(
  userId: number,
  personaId: number,
  limit = 20,
) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.personaId, personaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
