// 상대경로 import — 이 모듈은 tsx 테스트(scripts/test-isolation)에서도 직접 import 된다.
import * as memoriesRepo from "../db/repo/memories";
import * as eventsRepo from "../db/repo/events";
import * as settingsRepo from "../db/repo/settings";
import * as diaryRepo from "../db/repo/diary";
import { getEmbedConfig } from "./config";
import { embed } from "./embeddings";

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

// 프롬프트 조립은 lib/prompt.ts 로 3층 분리. 기존 import 경로 호환을 위해 re-export.
export { buildSystemPrompt } from "./prompt";
export type { PromptPersona, PromptContext } from "./prompt";

function startEndOfDay(tz: string): { start: Date; end: Date; nowLabel: string } {
  const now = new Date();
  // 표시는 사용자 timezone 기준. 일정 범위는 단순화해 서버 기준 당일로 잡는다.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
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
    userNickname: s?.nickname ?? null,
    userAbout: s?.about ?? null,
    handoffEnabled: s?.handoffEnabled ?? true,
  };
}
