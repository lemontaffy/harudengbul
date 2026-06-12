// 타임캡슐 — 봉인/배달 공용 로직(순수). 원문은 절대 변형하지 않는다.

// 저장 직후 오타 구제용 "다시 열기" 허용 창(5분). 이후 완전 봉인.
export const REOPEN_WINDOW_MS = 5 * 60 * 1000;

export function isReopenable(createdAt: Date | string, nowMs: number = Date.now()): boolean {
  return nowMs - new Date(createdAt).getTime() < REOPEN_WINDOW_MS;
}

const SEPARATOR = "\n\n———\n\n";

/**
 * 배달 메시지 = 인트로(페르소나 생성) + 구분선 + 원문 그대로.
 * content 는 trim·가공하지 않는다 — 특수문자·줄바꿈 보존.
 */
export function composeDelivery(intro: string, content: string): string {
  return `${intro.trim()}${SEPARATOR}${content}`;
}

/** intro 생성 실패/LLM 미설정 시 폴백(페르소나 말투 없이도 배달은 보장). */
export function fallbackIntro(createdDateLabel: string): string {
  return `네가 ${createdDateLabel}에 맡겨둔 편지야. 이제 열어볼 시간이 됐어.`;
}

/**
 * 배달 캐릭터 결정: 지정 캐릭터(활성) → 비서 역할 폴백 → 아무 활성 캐릭터 → 없음.
 * 지정 캐릭터가 삭제(personaId=null)·보관(활성 목록에 없음)된 경우 비서로 폴백.
 */
export function resolveDeliveryPersona<T extends { id: number; roles: string[] }>(
  actives: T[],
  personaId: number | null,
): T | null {
  if (personaId) {
    const exact = actives.find((p) => p.id === personaId);
    if (exact) return exact;
  }
  const secretary = actives.find((p) => p.roles.includes("secretary"));
  return secretary ?? actives[0] ?? null;
}

/** intro 생성용 지시문 — 본문은 절대 주지 않는다(요약·추측 차단). */
export function introInstruction(createdDateLabel: string): string {
  return [
    `사용자가 ${createdDateLabel}에 '미래의 자신'에게 써서 봉인해 둔 타임캡슐 편지를 지금 전달한다.`,
    "편지 본문은 너에게 보여주지 않는다 — 내용을 추측하거나 언급하지 마라.",
    "편지를 건네는 짧은 인트로 1~2문장만 네 말투로 써라. 본문은 코드가 그대로 붙인다.",
    "내용 평가·해석 금지. 그냥 '맡겨둔 걸 전한다'는 톤.",
  ].join(" ");
}
