import { and, desc, eq } from "drizzle-orm";
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
