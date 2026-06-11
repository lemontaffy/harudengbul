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
export function proactiveInstruction(trigger: Trigger, weatherLine?: string): string {
  const common =
    "사용자가 앱을 열지 않은 상태에서 네가 먼저 보내는 한 통의 메시지를 작성해. " +
    "2~4문장, 답장을 강요하는 말투는 금지.";
  if (trigger === "morning") {
    return (
      `지금은 아침이야. ${common}\n` +
      `오늘 날씨와 일정을 가볍게 브리핑하고 안부를 전해. ` +
      `비나 눈 예보가 있으면 우산·옷차림을 먼저 챙겨줘.` +
      (weatherLine ? `\n참고 — 오늘 날씨: ${weatherLine}` : "")
    );
  }
  return (
    `지금은 저녁이야. ${common}\n` +
    `오늘 하루가 어땠는지 따뜻하게 물어보고, 일기 쓰기를 가볍게 권유해.`
  );
}
