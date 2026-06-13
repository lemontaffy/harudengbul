// 펫 순수 로직 — 스테이지 계산, 폴백 대사, 금지 대사 필터. (DB·IO 없음 → 테스트 용이)

export type Stage = "baby" | "teen" | "adult";
export const STAGES: Stage[] = ["baby", "teen", "adult"];
export type SpriteKind = "idle" | "sleep" | "walk" | "love" | "sit";
export const SPRITE_KINDS: SpriteKind[] = ["idle", "sleep", "walk", "love", "sit"];

/** 성장 포인트 → 스테이지. 감소 없음(후퇴 불가). */
export function stageFor(points: number, teen: number, adult: number): Stage {
  if (points >= adult) return "adult";
  if (points >= teen) return "teen";
  return "baby";
}

/** 도달한 스테이지 목록(모습 선택 UI — 미도달은 비노출). baby는 항상. */
export function reachedStages(points: number, teen: number, adult: number): Stage[] {
  const out: Stage[] = ["baby"];
  if (points >= teen) out.push("teen");
  if (points >= adult) out.push("adult");
  return out;
}

/** 표시 스테이지 — display_stage 가 도달한 스테이지면 그것, 아니면 실제 성장 스테이지. */
export function displayStageFor(
  growthStage: Stage,
  displayStage: string | null,
  reached: Stage[],
): Stage {
  if (displayStage && (reached as string[]).includes(displayStage)) return displayStage as Stage;
  return growthStage;
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

/**
 * walk 전용 조회 — idle 폴백 없음(walk 슬롯 없으면 산책 금지). 현재 이하 스테이지의 walk 만.
 * (일반 pickSpritePath 는 walk 가 없으면 idle 로 폴백해 '미끄러지는 이동'을 유발하므로 분리.)
 */
export function pickWalkPath(
  sprites: { stage: string; kind: string; path: string }[],
  stage: Stage,
): string | null {
  return pickKindStrict(sprites, stage, "walk");
}

/** sit 전용 조회 — idle 폴백 없음(sit 슬롯 없으면 가구에 앉지 않음). 현재 이하 스테이지의 sit 만. */
export function pickSitPath(
  sprites: { stage: string; kind: string; path: string }[],
  stage: Stage,
): string | null {
  return pickKindStrict(sprites, stage, "sit");
}

/** 특정 kind 만 엄격 조회(폴백 없음) — 현재 이하 스테이지에서 해당 kind 슬롯만. */
export function pickKindStrict(
  sprites: { stage: string; kind: string; path: string }[],
  stage: Stage,
  kind: string,
): string | null {
  const ladder: Stage[] = ["baby", "teen", "adult"];
  for (let i = ladder.indexOf(stage); i >= 0; i--) {
    const hit = sprites.find((s) => s.stage === ladder[i] && s.kind === kind);
    if (hit) return hit.path;
  }
  return null;
}

/** 관계 라벨이 '연인' 결인지(탭 시 love 이펙트 트리거). 자유 텍스트라 키워드 매칭. */
export function isLoveLabel(label: string): boolean {
  return /연인|사랑|커플|love|연애/i.test(label);
}

/** 관계 라벨이 '적대' 결인지(빠직 anger 이펙트 트리거). isLoveLabel과 대칭. */
export function isHostileLabel(label: string): boolean {
  return /혐관|라이벌|앙숙|적대|견제|rival/i.test(label);
}

/** 자동 생성 대사가 금지(죽음/자해·비속어)에 걸리면 true → 제외. */
export function forbiddenLine(s: string): boolean {
  const t = s.normalize("NFC");
  return DEATH_SELFHARM.test(t) || PROFANITY.test(t);
}

/**
 * 패널 삭제 시 펫 pos_x(스트립 전체 %) 보정 — 펫이 허공에 남지 않게 인접 패널로.
 * deletedIdx = 삭제 패널의 정렬 인덱스, oldN = 삭제 전 패널 수. 패널 내 상대 위치는 보존.
 */
export function remapPosAfterDelete(posX: number, deletedIdx: number, oldN: number): number {
  if (oldN <= 1) return posX; // 패널 1개뿐이면 좌표계 불변
  const panelW = 100 / oldN;
  const panel = Math.max(0, Math.min(oldN - 1, Math.floor(posX / panelW)));
  const intra = Math.max(0, Math.min(1, (posX - panel * panelW) / panelW));
  let newPanel: number;
  if (panel < deletedIdx) newPanel = panel;
  else if (panel === deletedIdx) newPanel = Math.min(deletedIdx, oldN - 2); // 인접 패널로
  else newPanel = panel - 1;
  const newW = 100 / (oldN - 1);
  return Math.max(2, Math.min(98, (newPanel + intra) * newW));
}

/** 두 펫 id 를 a<b 로 정규화(관계 unique pair). */
export function normalizePair(p1: number, p2: number): { a: number; b: number } {
  return p1 < p2 ? { a: p1, b: p2 } : { a: p2, b: p1 };
}

/**
 * 폴백 2축으로 스프라이트 경로 선택:
 *  ① (stage,kind) 정확 → ② 같은 스테이지 idle → ③ 현재 이하 가장 최근 스테이지의 idle→any.
 * 아무 것도 없으면 null(플레이스홀더 렌더).
 */
export function pickSpritePath(
  sprites: { stage: string; kind: string; path: string }[],
  stage: Stage,
  kind: SpriteKind,
): string | null {
  const find = (st: string, kd: string) =>
    sprites.find((s) => s.stage === st && s.kind === kd)?.path ?? null;
  const exact = find(stage, kind);
  if (exact) return exact;
  const ladder: Stage[] = ["baby", "teen", "adult"];
  for (let i = ladder.indexOf(stage); i >= 0; i--) {
    const st = ladder[i];
    const idle = find(st, "idle");
    if (idle) return idle;
    const any = sprites.find((s) => s.stage === st);
    if (any) return any.path;
  }
  return null;
}
