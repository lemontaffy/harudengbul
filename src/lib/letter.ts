// 주간 회고 편지 — 상담사 캐릭터가 한 주의 일기·기분·달성을 묶어 쓰는 짧은 편지.
// 채팅 톤 규칙(1~5문장)을 쓰지 않고 손편지용 프롬프트를 따로 조립한다.
// 상대경로 import — worker(tsx)/Next 양쪽에서 안전.
import * as diaryRepo from "../db/repo/diary";
import * as lettersRepo from "../db/repo/letters";
import * as settingsRepo from "../db/repo/settings";
import * as personasRepo from "../db/repo/personas";
import { getLlmConfig } from "./config";
import { completeChat, type ChatMessage } from "./llm";
import { todayInTz } from "./proactive";

const MOOD_LABEL: Record<string, string> = {
  storm: "먹구름",
  rain: "비",
  cloud: "흐림",
  haze: "안개",
  sun: "맑음",
};
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(d);
}

/** todayStr("YYYY-MM-DD")이 속한 주의 월요일~일요일. */
export function weekRangeFor(todayStr: string): { weekStart: string; weekEnd: string } {
  const t = new Date(todayStr + "T00:00:00Z");
  const fromMon = (t.getUTCDay() + 6) % 7; // 월=0 … 일=6
  const start = new Date(t);
  start.setUTCDate(t.getUTCDate() - fromMon);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { weekStart: ymd(start), weekEnd: ymd(end) };
}

async function gatherWeek(userId: number, weekStart: string, weekEnd: string) {
  const entries = await diaryRepo.listBetween(userId, weekStart, weekEnd);
  const moodCount: Record<string, number> = {};
  const dayLines: string[] = [];
  for (const e of entries) {
    const items = await diaryRepo.getItems(e.id);
    const wd = WEEKDAY[new Date(e.entryDate + "T00:00:00Z").getUTCDay()];
    if (e.mood) moodCount[e.mood] = (moodCount[e.mood] ?? 0) + 1;
    const moodTxt = e.mood ? (MOOD_LABEL[e.mood] ?? e.mood) : "기록없음";
    const itemTxt = items.length
      ? " · 한 일: " +
        items.map((it) => `${it.label}${it.amount ? ` ${it.amount}` : ""}`).join(", ")
      : "";
    const bodyTxt = e.body?.trim() ? ` · 일기: ${e.body.trim().slice(0, 200)}` : "";
    dayLines.push(`[${e.entryDate}(${wd})] 기분 ${moodTxt}${itemTxt}${bodyTxt}`);
  }
  const moodSummary = Object.entries(moodCount)
    .map(([m, n]) => `${MOOD_LABEL[m] ?? m} ${n}일`)
    .join(", ");
  return { dayLines, moodSummary, hasData: entries.length > 0 };
}

function letterSystem(name: string | null, traits: string | null): string {
  const who = name?.trim() || "상담 동반자";
  return `너는 ${who}, 사용자의 상담 동반자다. 일요일 저녁, 사용자의 한 주를 돌아보는 짧은 편지를 쓴다.

[편지 규칙]
- 따뜻하고 담백한 손편지 말투. 3~5개의 짧은 문단.
- 행동묘사·지문(*웃으며* 등) 금지. 나레이션·과장·이모지 남발 금지.
- 반드시 아래 [이번 주 기록]의 구체적 사실(요일·기분·한 일·횟수)을 근거로 짚는다.
  예: "이번 주는 비가 사흘이었는데 그래도 수요일에 그림을 3장 그렸더라." 처럼.
- 진단하지 않는다. 자책이 과해 보이면 친한 친구의 관점으로 부드럽게 비춰준다.
- 기록이 적으면 적은 대로 담백하게, 다그치지 않는다.
- 인사말로 시작하고, 마지막 문단은 다음 한 주를 향한 짧은 응원 한 줄.
- 끝에 서명은 직접 적지 않는다(서명은 앱이 붙인다).${traits?.trim() ? `\n\n[너의 말버릇/성격]\n${traits.trim()}` : ""}`;
}

function letterUser(
  weekStart: string,
  weekEnd: string,
  moodSummary: string,
  dayLines: string[],
): string {
  return `이번 주(${weekStart} ~ ${weekEnd}) 기록을 바탕으로 편지를 써줘.

[이번 주 기분 요약] ${moodSummary || "(기록 없음)"}

[이번 주 기록]
${dayLines.length ? dayLines.join("\n") : "(이번 주 일기 기록이 없어요)"}`;
}

export type LetterResult =
  | { id: number; weekStart: string }
  | { skipped: string };

/**
 * 이번 주(오늘이 속한 주) 회고 편지를 생성/갱신해 저장한다.
 * 데이터/연결이 없으면 skipped 반환(발송하지 않음).
 */
export async function generateWeeklyLetter(userId: number): Promise<LetterResult> {
  const s = await settingsRepo.getByUser(userId);
  const tz = s?.timezone ?? "Asia/Seoul";
  const { weekStart, weekEnd } = weekRangeFor(todayInTz(tz));

  const conn = await getLlmConfig(userId);
  if (!conn.configured) return { skipped: "AI 연결 미설정" };

  const { dayLines, moodSummary, hasData } = await gatherWeek(userId, weekStart, weekEnd);
  if (!hasData) return { skipped: "이번 주 일기 기록 없음" };

  // 서명할 상담사: 저녁 담당 캐릭터 → 없으면 첫 활성 상담가 → 그것도 없으면 첫 캐릭터.
  let persona = s?.eveningPersonaId
    ? await personasRepo.getOne(userId, s.eveningPersonaId)
    : undefined;
  if (!persona || persona.role !== "counselor" || !persona.isActive) {
    const actives = await personasRepo.listActiveByUser(userId);
    persona = actives.find((p) => p.role === "counselor") ?? actives[0];
  }

  const messages: ChatMessage[] = [
    { role: "system", content: letterSystem(persona?.name ?? null, persona?.traits ?? null) },
    { role: "user", content: letterUser(weekStart, weekEnd, moodSummary, dayLines) },
  ];
  const body = (await completeChat(conn, messages)).trim();
  if (!body) return { skipped: "생성 실패" };

  const row = await lettersRepo.upsert(userId, {
    weekStart,
    weekEnd,
    personaName: persona?.name ?? null,
    body,
  });
  return { id: row.id, weekStart };
}
