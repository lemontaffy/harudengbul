// 펫 순수 로직 — 스테이지 계산, 폴백 대사, 금지 대사 필터. (DB·IO 없음 → 테스트 용이)

export type Stage = "baby" | "teen" | "adult";
export const STAGES: Stage[] = ["baby", "teen", "adult"];
export type SpriteKind = "idle" | "sleep" | "walk" | "love";
export const SPRITE_KINDS: SpriteKind[] = ["idle", "sleep", "walk", "love"];

/** 성장 포인트 → 스테이지. 감소 없음(후퇴 불가). */
export function stageFor(points: number, teen: number, adult: number): Stage {
  if (points >= adult) return "adult";
  if (points >= teen) return "teen";
  return "baby";
}

// aux 미설정/실패 시 폴백 대사 풀(스테이지 톤 반영). 사용자를 향하지 않는 펫의 혼잣말.
export const DEFAULT_LINES: Record<Stage, string[]> = {
  baby: ["뀨?", "우꺄", "냐앙…", "배고파…", "엄마?", "데굴", "꼬물꼬물", "히끄"],
  teen: ["심심해!", "놀자 놀자", "오늘 뭐해?", "헤헤", "나 좀 멋지지?", "에이 몰라", "기분 좋아~", "두근두근"],
  adult: ["여기 좋네.", "잘 지냈어?", "오늘도 수고했어.", "느긋하게 가자.", "흠, 평화롭군.", "곁에 있을게.", "별일 없지?", "좋은 하루야."],
};

// 자동 생성에서만 제외하는 단 둘: 죽음·자해 언급, 비속어 원문. (만담·유치한 싸움·"꺼져"는 허용)
const DEATH_SELFHARM = /죽(어|여|을|음|고\s*싶|자|이)|자살|자해|목\s*매|손목\s*긋|뒤져|뒈져|죽여/;
const PROFANITY = /씨\s*발|시\s*발|씨\s*바|존\s*나|좆|병\s*신|지\s*랄|개\s*새끼|썅|엿\s*같|엿\s*먹/;

/** 자동 생성 대사가 금지(죽음/자해·비속어)에 걸리면 true → 제외. */
export function forbiddenLine(s: string): boolean {
  const t = s.normalize("NFC");
  return DEATH_SELFHARM.test(t) || PROFANITY.test(t);
}

/** 두 펫 id 를 a<b 로 정규화(관계 unique pair). */
export function normalizePair(p1: number, p2: number): { a: number; b: number } {
  return p1 < p2 ? { a: p1, b: p2 } : { a: p2, b: p1 };
}
