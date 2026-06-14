// proactive 선제 톡 — 순수 판단/문구 헬퍼(테스트 용이). 실제 발송은 worker.
import type { Role } from "./persona";

export type Trigger = "morning" | "evening";

/**
 * 슬롯 발송 시점인지. 오늘(사용자 tz) 아직 안 보냈고, 현재 시각이 슬롯 시각 이상이면 true.
 * 시각은 "HH:MM" 문자열 비교(동일 포맷이면 사전식 = 시간순).
 */
export function isSlotDue(
  nowHHMM: string,
  slotHHMM: string,
  lastSentDate: string | null,
  todayDate: string,
): boolean {
  if (lastSentDate === todayDate) return false; // 오늘 이미 발송
  return nowHHMM >= slotHHMM;
}

/** "YYYY-MM-DD" (tz 기준 오늘) */
export function todayInTz(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
}

/**
 * tz 기준 '오늘 0시'의 절대시각(Date). 서버 tz 무관.
 * (서버가 UTC면 Date#setHours(0..) 는 UTC 자정 = KST 오전 9시라, 일정 목록에서
 *  KST 새벽~오전 일정이 잘리던 버그가 있었다. 벽시계 0시를 오프셋 보정해 환산한다.)
 */
export function startOfTodayInTz(tz: string, now = new Date()): Date {
  const ymd = todayInTz(tz, now); // YYYY-MM-DD (tz)
  const base = new Date(`${ymd}T00:00:00Z`); // tz 벽시계 0시를 일단 UTC 로
  const off =
    new Date(base.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(base.toLocaleString("en-US", { timeZone: tz })).getTime();
  return new Date(base.getTime() + off);
}

/** tz 기준 오늘의 [start, end)(자정~다음 자정) 절대시각. */
export function dayBoundsInTz(tz: string, now = new Date()): { start: Date; end: Date } {
  const start = startOfTodayInTz(tz, now);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** "HH:MM" (tz 기준 현재 시각) */
export function nowHHMMInTz(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** time 컬럼 값("08:00:00" 등)을 "HH:MM" 으로. */
export function toHHMM(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

/** 트리거별 담당 역할(아침=비서, 저녁=상담가) — 참고/검증용. */
export const TRIGGER_ROLE: Record<Trigger, Role> = {
  morning: "secretary",
  evening: "counselor",
};

/** SPEC §3.3 선제 톡 지시문. system(캐릭터 프롬프트) 뒤 user 턴으로 붙인다. */
export function proactiveInstruction(
  trigger: Trigger,
  weatherLine?: string,
  petsLine?: string,
  memoCount?: number,
): string {
  const common =
    "사용자가 앱을 열지 않은 상태에서 네가 먼저 보내는 한 통의 메시지를 작성해. " +
    "2~4문장, 답장을 강요하는 말투는 금지.";
  if (trigger === "morning") {
    return (
      `지금은 아침이야. ${common}\n` +
      `오늘 날씨와 일정을 가볍게 브리핑하고 안부를 전해. ` +
      `비나 눈 예보가 있으면 우산·옷차림을 먼저 챙겨줘.` +
      (weatherLine ? `\n참고 — 오늘 날씨: ${weatherLine}` : "") +
      (petsLine
        ? `\n참고 — 사용자의 펫: ${petsLine}. 가끔(매번은 금지) 한 줄 가볍게 언급해도 좋아. 의무는 아니야.`
        : "") +
      (memoCount && memoCount > 0
        ? `\n참고 — 주머니 메모가 ${memoCount}개 있어. 부담 없이 "주머니에 ${memoCount}개 있어" 정도로 한 줄까지만 언급 가능(내용 나열·독촉 금지). 0개면 언급 안 함.`
        : "")
    );
  }
  return (
    `지금은 저녁이야. ${common}\n` +
    `오늘 하루가 어땠는지 따뜻하게 물어보고, 일기 쓰기를 가볍게 권유해.`
  );
}

/** 일기 리마인드 선제 톡 지시문(고정 규칙). askReduce면 "줄여줄까?" 1회 포함. */
export function diaryReminderInstruction(askReduce: boolean): string {
  const base =
    "사용자가 앱을 열지 않은 저녁이야. 오늘 하루를 가볍게 묻는 한두 문장을 네 말투로 써서, 일기를 부담 없이 권해.\n" +
    "- 한 줄이나 이모지 하나만으로도 충분하다고 덧붙인다.\n" +
    "- 내키지 않으면 안 써도 된다는 뉘앙스를 담는다. 의무·압박·재촉 표현 금지.\n" +
    "- 못 쓴 날을 지적하거나 연속 작성 일수(스트릭)를 언급하지 않는다.";
  if (askReduce) {
    return (
      base +
      "\n- 추가로, 이 알림이 부담되면 줄이거나 끌 수 있다는 걸 '계속 보낼까? 줄여줄까?'처럼 한 번만 가볍게 물어본다."
    );
  }
  return base;
}
