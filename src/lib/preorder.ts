// 예약·잔금 공용 헬퍼 — 잔금 리마인더 일정(기존 events 인프라 재사용) + 클라이언트 직렬화.
import type { PreorderRow } from "@/db/repo/preorders";

// 잔금 예정일 '며칠 전'에 알림(예정일 오전 10시 KST 기준으로 N일 전 발화).
export const REMINDER_DAYS_BEFORE = 3;
export const REMINDER_ALARM_MIN = REMINDER_DAYS_BEFORE * 24 * 60;

/** 잔금 예정일(YYYY-MM-DD) → 그날 오전 10시 KST Date. events.startsAt 앵커로 사용. */
export function reminderStartAt(dueDate: string): Date {
  return new Date(`${dueDate}T10:00:00+09:00`);
}

export function reminderTitle(name: string): string {
  return `예약 잔금 — ${name}`;
}

const num = (v: string | null): number | null => (v == null ? null : Number(v));

/** 클라이언트 표시용 직렬화 — numeric(CNY) 문자열을 숫자로. */
export function publicPreorder(r: PreorderRow) {
  return {
    id: r.id,
    name: r.name,
    currency: r.currency,
    depositAmount: num(r.depositAmount),
    depositKrw: r.depositKrw,
    depositDate: r.depositDate,
    balanceAmount: num(r.balanceAmount),
    balanceKrwEstimate: r.balanceKrwEstimate,
    balanceDueDate: r.balanceDueDate,
    balanceKrwActual: r.balanceKrwActual,
    status: r.status as "pending" | "paid",
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  };
}

export type PublicPreorder = ReturnType<typeof publicPreorder>;
