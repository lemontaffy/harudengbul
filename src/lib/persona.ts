// 상대경로 import — 이 모듈은 tsx 테스트(scripts/test-isolation)에서도 직접 import 된다.
import * as memoriesRepo from "../db/repo/memories";
import * as eventsRepo from "../db/repo/events";
import * as settingsRepo from "../db/repo/settings";

// 역할은 고정 2종. 캐릭터(이름·성격)는 사용자 소유 데이터(personas 테이블).
export type Role = "counselor" | "secretary";

export function isRole(v: unknown): v is Role {
  return v === "counselor" || v === "secretary";
}

export const ROLE_LABEL: Record<Role, string> = {
  counselor: "상담가",
  secretary: "비서",
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

/** 사용자별(userId 스코프) 컨텍스트 수집 — 격리 필수(DELTA §5). */
export async function buildContext(userId: number) {
  const s = await settingsRepo.getByUser(userId);
  const tz = s?.timezone ?? "Asia/Seoul";
  const { start, end, nowLabel } = startEndOfDay(tz);

  const [mems, todays] = await Promise.all([
    memoriesRepo.getForPrompt(userId, 20),
    eventsRepo.getBetween(userId, start, end),
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
    userNickname: s?.nickname ?? null,
    userAbout: s?.about ?? null,
    handoffEnabled: s?.handoffEnabled ?? true,
  };
}
