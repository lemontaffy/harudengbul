import { and, asc, eq, gte, lt, sql, isNotNull } from "drizzle-orm";
import { db } from "../client";
import { events } from "../schema";

export type EventRow = typeof events.$inferSelect;

/**
 * alarmJob 용 — 알람 시각(starts_at - alarm_minutes_before)이 도달했고 아직 미발송인 일정을
 * 원자적으로 "청구"(alarm_sent=true 설정)하고 반환한다. 청구-후-발송이라 틱이 겹쳐도 중복 발송 없음.
 * 다운타임 누적 폭주 방지: 시작이 1일 이상 지난 건은 제외(그대로 미발송으로 남음).
 */
export async function claimDueAlarms() {
  return db
    .update(events)
    .set({ alarmSent: true })
    .where(
      and(
        isNotNull(events.alarmMinutesBefore),
        eq(events.alarmSent, false),
        sql`${events.startsAt} - make_interval(mins => ${events.alarmMinutesBefore}) <= now()`,
        sql`${events.startsAt} >= now() - interval '1 day'`,
      ),
    )
    .returning({
      id: events.id,
      userId: events.userId,
      title: events.title,
      startsAt: events.startsAt,
    });
}

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
