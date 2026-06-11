import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { events } from "../schema";

export type EventRow = typeof events.$inferSelect;

/** 컨텍스트/대시보드용 — 기간 내 사용자 일정(시간순). */
export async function getBetween(userId: number, start: Date, end: Date) {
  return db
    .select({ id: events.id, title: events.title, startsAt: events.startsAt })
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

/** from 이후 예정 일정(시간순). */
export async function listFrom(userId: number, from: Date, limit = 200) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), gte(events.startsAt, from)))
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export async function getOne(userId: number, id: number) {
  return db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, userId)),
  });
}

export async function create(
  userId: number,
  input: {
    title: string;
    startsAt: Date;
    endsAt?: Date | null;
    alarmMinutesBefore?: number | null;
  },
) {
  const [row] = await db
    .insert(events)
    .values({
      userId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      alarmMinutesBefore: input.alarmMinutesBefore ?? null,
    })
    .returning();
  return row;
}

export async function update(
  userId: number,
  id: number,
  patch: {
    title?: string;
    startsAt?: Date;
    endsAt?: Date | null;
    alarmMinutesBefore?: number | null;
  },
) {
  await db
    .update(events)
    .set(patch)
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}

export async function remove(userId: number, id: number) {
  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}
