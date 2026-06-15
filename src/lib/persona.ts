// 상대경로 import — 이 모듈은 tsx 테스트(scripts/test-isolation)에서도 직접 import 된다.
import * as memoriesRepo from "../db/repo/memories";
import * as eventsRepo from "../db/repo/events";
import * as settingsRepo from "../db/repo/settings";
import * as diaryRepo from "../db/repo/diary";
import { getEmbedConfig } from "./config";
import { embed } from "./embeddings";
import { dayBoundsInTz } from "./proactive";

const MOOD_LABEL: Record<string, string> = {
  storm: "폭풍",
  rain: "비",
  cloud: "흐림",
  haze: "옅은 해",
  sun: "맑음",
};
const CONDITION_LABEL: Record<string, string> = {
  sick: "아픔",
  tired: "피곤",
  normal: "보통",
  energetic: "쌩쌩",
};

// 역할은 고정 5종. 캐릭터(이름·성격)는 사용자 소유 데이터(personas 테이블).
// role 은 text 컬럼이라 enum 마이그레이션 없이 값만 추가하면 된다.
export type Role =
  | "counselor"
  | "secretary"
  | "nutritionist"
  | "study_mate"
  | "friend";

export const ROLES: Role[] = [
  "counselor",
  "secretary",
  "nutritionist",
  "study_mate",
  "friend",
];

// 시스템이 의존하는(트리거 담당·최소 1명 보장이 필요한) 역할. 신규 3종은 선택적.
export const REQUIRED_ROLES: Role[] = ["counselor", "secretary"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}

export const ROLE_LABEL: Record<Role, string> = {
  counselor: "상담가",
  secretary: "비서",
  nutritionist: "영양사",
  study_mate: "스터디 메이트",
  friend: "친구",
};

// 페르소나는 복수 역할(roles 배열)을 가질 수 있다. 배열 첫 원소가 '주 역할'.
/** 주 역할(말투·호칭 기준). roles[0]. */
export function primaryRole(roles: string[]): Role {
  return (roles[0] ?? "secretary") as Role;
}
/** 표기용 — "스터디 메이트 · 친구" */
export function rolesLabel(roles: string[]): string {
  return roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(" · ");
}

/**
 * 역할 조합 검증(생성·수정 API·UI 공통 규칙).
 * - 최소 1개, 최대 3개, 중복 금지.
 * - counselor 는 단독 전용: 다른 역할과 조합 불가.
 *   (상담 공간 분리 원칙 — 상담가가 실행 도구를 겸하면 동의 기반 핸드오프 구조가 무력화됨)
 * - 그 외(secretary|nutritionist|study_mate|friend)는 자유 조합.
 */
export function validateRoles(
  input: unknown,
): { ok: true; roles: Role[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0)
    return { ok: false, error: "역할을 최소 1개 선택하세요." };
  if (!input.every(isRole)) return { ok: false, error: "알 수 없는 역할이 있어요." };
  const roles = input as Role[];
  if (new Set(roles).size !== roles.length)
    return { ok: false, error: "같은 역할을 중복할 수 없어요." };
  if (roles.length > 3) return { ok: false, error: "역할은 최대 3개까지예요." };
  if (roles.includes("counselor") && roles.length > 1)
    return { ok: false, error: "상담가는 다른 역할과 조합할 수 없어요(단독 전용)." };
  return { ok: true, roles };
}

// 프롬프트 조립은 lib/prompt.ts 로 3층 분리. 기존 import 경로 호환을 위해 re-export.
export { buildSystemPrompt } from "./prompt";
export type { PromptPersona, PromptContext } from "./prompt";

function startEndOfDay(tz: string): { start: Date; end: Date; nowLabel: string } {
  const now = new Date();
  // 일정 범위·표시 모두 사용자 timezone 당일 기준(서버 UTC 자정 기준이면 하루가 어긋나던 문제).
  const { start, end } = dayBoundsInTz(tz, now);
  const nowLabel = now.toLocaleString("ko-KR", { timeZone: tz });
  return { start, end, nowLabel };
}

/** 기억 회수 — query+임베딩 가능하면 의미 검색, 아니면(또는 결과 없으면) importance 폴백. */
async function recallMemories(userId: number, query?: string) {
  const q = query?.trim();
  if (q) {
    const cfg = await getEmbedConfig(userId);
    if (cfg.configured) {
      const vec = await embed(cfg, q);
      if (vec) {
        const hits = await memoriesRepo.searchByEmbedding(userId, vec, 20);
        if (hits.length) return hits;
      }
    }
  }
  return memoriesRepo.getForPrompt(userId, 20);
}

/**
 * 사용자별(userId 스코프) 컨텍스트 수집 — 격리 필수(DELTA §5).
 * query 주어지고 임베딩 가능하면 의미 검색으로 관련 기억을 회수, 아니면 importance 폴백.
 */
export async function buildContext(userId: number, query?: string) {
  const s = await settingsRepo.getByUser(userId);
  const tz = s?.timezone ?? "Asia/Seoul";
  const { start, end, nowLabel } = startEndOfDay(tz);
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const [mems, todays, todayEntry] = await Promise.all([
    recallMemories(userId, query),
    eventsRepo.getBetween(userId, start, end),
    diaryRepo.getByDate(userId, todayStr),
  ]);

  const memories = mems.map((m) => `- ${m.content}`).join("\n");
  const todayEvents = todays
    .map((e) => {
      const t = e.startsAt
        ? new Date(e.startsAt).toLocaleTimeString("ko-KR", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return `- ${t} ${e.title}`.trim();
    })
    .join("\n");

  return {
    now: nowLabel,
    memories,
    todayEvents,
    todayMood: todayEntry?.mood ? (MOOD_LABEL[todayEntry.mood] ?? todayEntry.mood) : null,
    todayCondition: todayEntry?.bodyCondition
      ? (CONDITION_LABEL[todayEntry.bodyCondition] ?? todayEntry.bodyCondition)
      : null,
    todayDiary: todayEntry?.body?.trim() || null, // 일기 본문 — 상담사만 열람(prompt에서 게이트)
    userNickname: s?.nickname ?? null,
    userAbout: s?.about ?? null,
    handoffEnabled: s?.handoffEnabled ?? true,
  };
}
