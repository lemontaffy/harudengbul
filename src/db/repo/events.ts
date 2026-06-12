import { and, asc, eq, gte, lt, sql, isNotNull, isNull } from "drizzle-orm";
import { db } from "../client";
import { events } from "../schema";

export type EventRow = typeof events.$inferSelect;

// ── Google 캘린더 매핑 ──
export async function getByGoogleId(userId: number, googleId: string) {
  return db.query.events.findFirst({
    where: and(eq(events.userId, userId), eq(events.googleEventId, googleId)),
  });
}

/** Google 이벤트 → 로컬 upsert(있으면 갱신, 없으면 source=google 생성). pull 전용(push 안 함). */
export async function upsertFromGoogle(
  userId: number,
  googleId: string,
  patch: {
    title: string;
    startsAt: Date;
    endsAt: Date | null;
    alarmMinutesBefore: number | null;
  },
) {
  const existing = await getByGoogleId(userId, googleId);
  if (existing) {
    await db
      .update(events)
      .set({
        title: patch.title,
        startsAt: patch.startsAt,
        endsAt: patch.endsAt,
        alarmMinutesBefore: patch.alarmMinutesBefore,
      })
      .where(and(eq(events.id, existing.id), eq(events.userId, userId)));
    return existing.id;
  }
  const [row] = await db
    .insert(events)
    .values({
      userId,
      title: patch.title,
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      alarmMinutesBefore: patch.alarmMinutesBefore,
      source: "google",
      googleEventId: googleId,
    })
    .returning({ id: events.id });
  return row.id;
}

export async function deleteByGoogleId(userId: number, googleId: string) {
  await db
    .delete(events)
    .where(and(eq(events.userId, userId), eq(events.googleEventId, googleId)));
}

export async function setGoogleId(userId: number, id: number, googleId: string) {
  await db
    .update(events)
    .set({ googleEventId: googleId, source: "google" })
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}

/** 아직 Google에 안 올라간 로컬 이벤트(push 보정용). */
export async function listUnsynced(userId: number, limit = 100) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), isNull(events.googleEventId)))
    .orderBy(asc(events.id))
    .limit(limit);
}

/**
 * alarmJob 용 — 알람 시각(starts_at - alarm_minutes_before)이 도달했고 아직 미발송인 일정을
 * 원자적으로 "청구"(alarm_sent=true 설정)하고 반환한다. 청구-후-발송이라 틱이 겹쳐도 중복 발송 없음.
 * 다운타임 누적 폭주 방지: 시작이 1일 이상 지난 건은 제외(그대로 미발송으로 남음).
 */
export async function claimDueAlarms() {
  return db
    .update(events)
    .set({ alarmSent: true, alarmLastNotifiedAt: sql`now()` })
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

/**
 * 반복 알림(스누즈) 청구 — 첫 알람이 발송됐고(alarm_sent) 아직 ack 안 했고,
 * keep 창(알람시각 ~ 알람시각+keep분) 안이며 마지막 알림 후 repeatInterval분 경과한 건을
 * 원자적으로 청구(alarm_last_notified_at=now)하고 반환. 청구-후-발송이라 틱 겹쳐도 중복 없음.
 */
export async function claimDueRepeats(repeatIntervalMin: number) {
  return db
    .update(events)
    .set({ alarmLastNotifiedAt: sql`now()` })
    .where(
      and(
        eq(events.alarmSent, true),
        eq(events.alarmAcked, false),
        isNull(events.alarmSnoozeUntil), // 스누즈 중엔 일반 반복 억제
        isNotNull(events.alarmMinutesBefore),
        isNotNull(events.alarmKeepMinutes),
        isNotNull(events.alarmLastNotifiedAt),
        sql`${events.alarmKeepMinutes} > 0`,
        sql`now() <= ${events.startsAt} - make_interval(mins => ${events.alarmMinutesBefore}) + make_interval(mins => ${events.alarmKeepMinutes})`,
        sql`now() >= ${events.alarmLastNotifiedAt} + make_interval(mins => ${repeatIntervalMin})`,
      ),
    )
    .returning({
      id: events.id,
      userId: events.userId,
      title: events.title,
      startsAt: events.startsAt,
    });
}

/** 사용자가 알림을 확인(탭) → 반복 중단. */
export async function ackAlarm(userId: number, id: number) {
  await db
    .update(events)
    .set({ alarmAcked: true })
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}

/**
 * 스누즈('10분 뒤 다시') — until 까지 반복 억제. 토큰 인증이라 user 스코프 없음(eventId 한정).
 * 미발송·ack 된 건은 무의미하니 alarm_sent & !ack 인 것만. 성공 시 true.
 */
export async function snoozeAlarm(id: number, until: Date): Promise<boolean> {
  const r = await db
    .update(events)
    .set({ alarmSnoozeUntil: until })
    .where(and(eq(events.id, id), eq(events.alarmSent, true), eq(events.alarmAcked, false)))
    .returning({ id: events.id });
  return r.length > 0;
}

/** 스누즈 도래분 청구 — snooze_until 지난 미ack 건을 1회 재푸시. 청구하며 snooze 해제. */
export async function claimDueSnoozes() {
  return db
    .update(events)
    .set({ alarmLastNotifiedAt: sql`now()`, alarmSnoozeUntil: null })
    .where(
      and(
        isNotNull(events.alarmSnoozeUntil),
        eq(events.alarmAcked, false),
        sql`${events.alarmSnoozeUntil} <= now()`,
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
    alarmKeepMinutes?: number | null;
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
      alarmKeepMinutes: input.alarmKeepMinutes ?? null,
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
    alarmKeepMinutes?: number | null;
  },
) {
  // 알람 관련 필드가 바뀌면 알람 상태를 재무장(다시 울리도록).
  const rearm =
    patch.startsAt !== undefined ||
    patch.alarmMinutesBefore !== undefined ||
    patch.alarmKeepMinutes !== undefined;
  await db
    .update(events)
    .set(
      rearm
        ? { ...patch, alarmSent: false, alarmAcked: false, alarmLastNotifiedAt: null }
        : patch,
    )
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}

export async function remove(userId: number, id: number) {
  await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)));
}
