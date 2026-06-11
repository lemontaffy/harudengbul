import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../client";
import { usageLog } from "../schema";

export type UsageKind = "chat" | "diary_reply" | "proactive" | "memory";

export async function log(
  userId: number,
  kind: UsageKind,
  tokensIn = 0,
  tokensOut = 0,
) {
  await db.insert(usageLog).values({ userId, kind, tokensIn, tokensOut });
}

/** 오늘(since 이후) 해당 사용자의 'chat' 메시지 수 — daily_message_limit 비교용. */
export async function countChatSince(userId: number, since: Date) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageLog)
    .where(
      and(
        eq(usageLog.userId, userId),
        eq(usageLog.kind, "chat"),
        gte(usageLog.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/** 사용자별 오늘 사용량 집계(어드민 화면용). */
export async function countByUserSince(since: Date) {
  return db
    .select({
      userId: usageLog.userId,
      n: sql<number>`count(*)::int`,
    })
    .from(usageLog)
    .where(gte(usageLog.createdAt, since))
    .groupBy(usageLog.userId);
}
