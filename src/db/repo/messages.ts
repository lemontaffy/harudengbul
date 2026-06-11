import { and, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { messages } from "../schema";

export type MsgRole = "user" | "assistant" | "proactive";

export async function add(
  userId: number,
  persona: string,
  role: MsgRole,
  content: string,
) {
  const [row] = await db
    .insert(messages)
    .values({ userId, persona, role, content })
    .returning();
  return row;
}

/** 화면용 — 페르소나별 스레드, 오래된→최신 순. */
export async function listForView(userId: number, persona: string, limit = 100) {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.persona, persona)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** 프롬프트용 — 최근 N턴(role/content만), 오래된→최신. */
export async function listForPrompt(userId: number, persona: string, limit = 20) {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.persona, persona)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
