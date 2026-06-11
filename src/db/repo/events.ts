import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { events } from "../schema";

/** 컨텍스트용 — 기간 내 사용자 일정(시간순). */
export async function getBetween(userId: number, start: Date, end: Date) {
  return db
    .select({ title: events.title, startsAt: events.startsAt })
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        gte(events.startsAt, start),
        lt(events.startsAt, end),
      ),
    )
    .orderBy(asc(events.startsAt));
}
