import { lt } from "drizzle-orm";
import { db } from "../client";
import { snoozeTokens } from "../schema";

/** 토큰 1회용 소비 — 처음이면 true(기록됨), 이미 쓴 jti면 false(재사용). */
export async function consume(jti: string): Promise<boolean> {
  const r = await db
    .insert(snoozeTokens)
    .values({ jti })
    .onConflictDoNothing()
    .returning({ jti: snoozeTokens.jti });
  return r.length > 0;
}

/** 오래된 소비 기록 정리(토큰 TTL 30분 → 1일 지난 건 안전 삭제). */
export async function prune(): Promise<void> {
  await db.delete(snoozeTokens).where(lt(snoozeTokens.usedAt, new Date(Date.now() - 86400_000)));
}
