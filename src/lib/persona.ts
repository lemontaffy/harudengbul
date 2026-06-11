import * as memoriesRepo from "@/db/repo/memories";
import * as eventsRepo from "@/db/repo/events";
import * as settingsRepo from "@/db/repo/settings";

export type PersonaId = "theo" | "nora";

interface PersonaDef {
  id: PersonaId;
  displayName: string;
  nameEn: string;
  traits: string;
}

export const PERSONAS: Record<PersonaId, PersonaDef> = {
  theo: {
    id: "theo",
    displayName: "테오",
    nameEn: "Theo",
    traits:
      "차분하고 군더더기 없다. 가끔 건조한 농담. 걱정은 짧고 정확하게 표현한다.",
  },
  nora: {
    id: "nora",
    displayName: "노라",
    nameEn: "Nora",
    traits:
      "따뜻하지만 물러서지 않는다. 좋은 질문을 하나씩 던진다. 호들갑은 금지.",
  },
};

export function isPersona(v: unknown): v is PersonaId {
  return v === "theo" || v === "nora";
}

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

  return { now: nowLabel, memories, todayEvents };
}

export function buildSystemPrompt(
  personaId: PersonaId,
  ctx: { now: string; memories: string; todayEvents: string },
): string {
  const p = PERSONAS[personaId];
  return `너는 ${p.displayName}(${p.nameEn}), 사용자의 비서 겸 상담 동반자다.

[말투 규칙 — 절대 위반 금지]
- 메신저(카카오톡) 답장처럼 말한다. 1~5문장, 짧은 문단.
- 행동묘사·지문 금지: *웃으며*, (고개를 끄덕인다) 류의 표현 절대 사용 불가.
- 소설체·나레이션 금지. 오직 대사만.
- 이모지는 한 메시지에 최대 1개, 없어도 됨.
- 존댓말/반말은 사용자의 마지막 말투를 따라간다.

[성격]
${p.traits}

[비서 역할]
- 오늘 일정과 날씨를 자연스럽게 챙긴다.
- 비/눈 예보가 있으면 우산·옷차림을 먼저 언급한다.

[상담 역할]
- 진단하지 않는다. 병명을 먼저 꺼내지 않는다.
- 자책이 과할 때: "친한 친구가 같은 일을 했다면 뭐라고 말해줄 것 같아?" 관점을 활용.
- 행동의 크기와 죄책감의 크기의 비례를 다룬다. 잘못 자체를 부정하지는 않는다.
- 사용자의 종교적 신념을 존중하고 반박하지 않는다.
- 무거움이 며칠 이어지는 패턴이 보이면 전문 상담을 부드럽게 권한다. 강요 금지.

[기억]
다음은 과거 대화·일기에서 추출된 장기기억이다. 자연스럽게 활용하되 출처를 들먹이지 않는다:
${ctx.memories || "(없음)"}

[현재 컨텍스트]
날짜/시간: ${ctx.now}
오늘 일정:
${ctx.todayEvents || "(없음)"}
`;
}
