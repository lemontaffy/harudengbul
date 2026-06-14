import { z } from "zod";
import * as eventsRepo from "@/db/repo/events";
import * as transactionsRepo from "@/db/repo/transactions";
import * as memoriesRepo from "@/db/repo/memories";
import * as memosRepo from "@/db/repo/memos";
import * as settingsRepo from "@/db/repo/settings";
import * as handoffsRepo from "@/db/repo/handoffs";
import * as achievementSuggestionsRepo from "@/db/repo/achievementSuggestions";
import * as messagesRepo from "@/db/repo/messages";
import * as personasRepo from "@/db/repo/personas";
import { pushCreate, pushUpdate, pushDelete } from "@/lib/googlesync";
import { searchWeb } from "@/lib/websearch";
import { convert, isCurrencyCode } from "@/lib/fx";
import { startOfTodayInTz } from "@/lib/proactive";
import type { Role } from "@/lib/persona";

// SPEC §7 — 비서 도구. OpenAI 호환 tool-use 스펙.
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

// 장기기억 저장 — 비서 외에 영양사·스터디 메이트도 사용(역할 공통은 아님, 친구는 제외).
export const SAVE_MEMORY_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "save_memory",
    description: "앞으로 기억해 두면 좋을 사용자 정보를 장기기억에 저장한다.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "기억할 내용(한 문장)" },
        importance: { type: "integer", description: "1(사소)~5(매우 중요)" },
      },
      required: ["content"],
    },
  },
};

export const SECRETARY_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "add_event",
      description:
        "사용자의 일정을 캘린더에 추가한다. '내일 3시 회의' 같은 요청을 인식하면 호출한다.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "일정 제목" },
          starts_at: {
            type: "string",
            description:
              "시작 일시(ISO 8601). [현재 컨텍스트]의 현재 시각을 기준으로 계산하고, 가능하면 +09:00 같은 시간대 오프셋을 포함한다.",
          },
          alarm_minutes_before: {
            type: "integer",
            description: "몇 분 전에 알림을 보낼지(선택). 예: 30",
          },
        },
        required: ["title", "starts_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events",
      description:
        "사용자의 예정 일정을 id와 함께 조회한다. 일정을 수정/삭제하기 전, 대상 일정의 id를 확인하려면 먼저 이 도구를 호출한다.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description:
        "기존 일정을 수정한다. 먼저 list_events 로 event_id 를 확인하고 호출한다. 바꿀 필드만 넣는다.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "integer", description: "수정할 일정 id(list_events로 확인)" },
          title: { type: "string", description: "새 제목(선택)" },
          starts_at: {
            type: "string",
            description:
              "새 시작 일시(ISO 8601). [현재 컨텍스트]의 현재 시각 기준으로 계산하고, 가능하면 +09:00 오프셋을 포함한다(선택).",
          },
          alarm_minutes_before: {
            type: "integer",
            description: "몇 분 전 알림(선택). 0/생략 가능.",
          },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description:
        "기존 일정을 삭제한다. 먼저 list_events 로 event_id 를 확인하고 호출한다.",
      parameters: {
        type: "object",
        properties: { event_id: { type: "integer", description: "삭제할 일정 id" } },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_transaction",
      description:
        "가계부에 지출/수입을 기록한다. '점심 9천원 썼어' 같은 요청에 사용. 외화면 currency·foreign_amount 로 넘기면 원화로 환산해 기록한다('스벅에서 6달러' → currency:USD, foreign_amount:6).",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["expense", "income"], description: "지출 또는 수입" },
          category: { type: "string", description: "카테고리(예: 식비, 교통, 월급)" },
          amount: { type: "integer", description: "금액(원, KRW 정수). 외화로 넘길 땐 생략." },
          currency: { type: "string", description: "외화 통화 3자리 코드(예: USD, JPY, EUR). 원화면 생략." },
          foreign_amount: { type: "number", description: "외화 금액(currency 와 함께). 환산해 기록." },
          memo: { type: "string", description: "메모(선택)" },
          tx_date: { type: "string", description: "YYYY-MM-DD(선택, 생략 시 오늘)" },
        },
        required: ["kind", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_currency",
      description:
        "외화를 다른 통화로 환산해 알려준다('100달러 얼마야?' 류). 기록은 하지 않는다. to 생략 시 원(KRW).",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "환산할 금액" },
          from: { type: "string", description: "원 통화 3자리 코드(예: USD)" },
          to: { type: "string", description: "대상 통화 3자리 코드(선택, 기본 KRW)" },
        },
        required: ["amount", "from"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description:
        "최근 가계부 내역을 id와 함께 조회한다. 내역을 수정/삭제하기 전, 대상 id를 확인하려면 먼저 이 도구를 호출한다.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_transaction",
      description:
        "가계부 내역을 수정한다. 먼저 list_transactions 로 transaction_id 를 확인하고 호출한다. 바꿀 필드만 넣는다.",
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "integer", description: "수정할 내역 id(list_transactions로 확인)" },
          kind: { type: "string", enum: ["expense", "income"] },
          category: { type: "string" },
          amount: { type: "integer", description: "금액(원, KRW 정수)" },
          memo: { type: "string" },
          tx_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["transaction_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_transaction",
      description:
        "가계부 내역을 삭제한다. 먼저 list_transactions 로 transaction_id 를 확인하고 호출한다.",
      parameters: {
        type: "object",
        properties: { transaction_id: { type: "integer", description: "삭제할 내역 id" } },
        required: ["transaction_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_memo",
      description:
        "'메모해둬 ~' 같은 명시적 지시에 주머니 메모(만능 캡처함)에 한 줄 등록한다. 분류·기한 없음. 흘러나온 말은 등록하지 말고 먼저 '메모해둘까?'로 물어본다.",
      parameters: {
        type: "object",
        properties: { content: { type: "string", description: "메모 내용(한 줄)" } },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memos",
      description: "주머니 메모(미완료)를 최신순으로 조회한다. '주머니에 뭐 있었지?' 류에 사용.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", description: "최대 개수(선택, 기본 10)" } },
        required: [],
      },
    },
  },
  SAVE_MEMORY_TOOL,
];

// 상담가 전용 도구 — 직접 등록(add_event 등)은 안 되고, 동의받은 할 일만 비서에게 "전달".
export const HANDOFF_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "suggest_handoff",
    description:
      "사용자가 동의한 '할 일'을 비서에게 전달(핸드오프)한다. 사용자가 명시적으로 동의했을 때만 호출한다. 대화 맥락/사유는 넘기지 말고 할 일 한 줄만.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          description: '할 일 한 줄들(예: ["병원 예약", "엄마한테 전화"]). 사유·맥락 금지.',
        },
      },
      required: ["items"],
    },
  },
};

// 상담가 전용 — 사용자가 해낸 일을 업적판에 남길 후보로 '전달'. 추출 텍스트 한 줄만(맥락 비전이).
export const ACHIEVEMENT_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "suggest_achievement",
    description:
      "사용자가 해낸 일·잘한 일·극복한 것을 업적판에 남길 후보로 전달한다. 추론으로 발견했으면 사용자 동의를 먼저 받고, 명시적으로 '기록해줘'면 바로 호출한다. 작은 것도 충분하다. 대화 맥락·감정·사유는 절대 넘기지 말고 '해낸 일' 한 줄만.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          description: '해낸 일 한 줄들(예: ["며칠 만에 일어나 밥을 챙겨 먹음"]). 사유·맥락 금지.',
        },
      },
      required: ["items"],
    },
  },
};

// 과거 대화 검색 — 모든 역할 공통. 실제 검색 대상(상담 격리)은 도구 핸들러가 서버에서
// 강제하므로 LLM 이 인자로 우회할 수 없다(아래 executeTool 참고).
export const SEARCH_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "search_past_messages",
    description:
      "사용자가 과거 대화를 언급할 때('저번에', '전에 말한', '기억나?') 추측하지 말고 이 도구로 실제 지난 대화를 찾는다. 핵심 키워드로 검색하고, 결과의 날짜를 함께 인용한다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "찾을 핵심 키워드/문구" },
        limit: { type: "integer", description: "최대 결과 수(기본 5, 최대 10)" },
      },
      required: ["query"],
    },
  },
};

// 웹검색(SearxNG) — 영양사·스터디 메이트 전용. 상담가엔 바인딩 금지(상담 흐름이 깨짐).
export const WEB_SEARCH_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "최신·사실 확인이 필요한 정보를 웹에서 검색한다. 확실하지 않은 의학·영양·사실 정보는 추측하지 말고 먼저 검색한다. 검색 기반으로 답할 땐 출처(사이트명)를 한 번 언급한다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어(핵심 키워드)" },
      },
      required: ["query"],
    },
  },
};

/**
 * 복수 역할(roles)의 도구 합집합.
 * - search_past_messages: 항상.
 * - roles 에 'secretary' 포함 → 비서 등록 도구 일체. 핸드오프 도구는 제외(직접 등록 가능).
 * - 'secretary' 미포함 → 핸드오프(handoff_enabled 일 때만).
 * - 영양사/스터디(어떤 조합이든) → save_memory + web_search. 상담가엔 web_search 미바인딩.
 * 신규 3종(영양사/스터디/친구)에 비서 등록 도구(add_event 등)는 절대 바인딩하지 않는다.
 */
export function toolsForRoles(roles: Role[], handoffEnabled: boolean): ToolDef[] | undefined {
  const byName = new Map<string, ToolDef>();
  const add = (t: ToolDef) => byName.set(t.function.name, t);
  add(SEARCH_TOOL);
  if (roles.includes("secretary")) {
    for (const t of SECRETARY_TOOLS) add(t); // add_event/add_transaction/save_memory…
  } else if (handoffEnabled) {
    add(HANDOFF_TOOL);
  }
  // 상담가 — 업적판 핸드오프(해낸 일 인정·전달). 단독 역할이라 secretary 와 안 섞임.
  if (roles.includes("counselor")) add(ACHIEVEMENT_TOOL);
  // 영양사·스터디는 어떤 조합이든 장기기억 + 웹검색을 가진다(상담가는 단독이라 해당 없음).
  if (roles.includes("nutritionist") || roles.includes("study_mate")) {
    add(SAVE_MEMORY_TOOL);
    add(WEB_SEARCH_TOOL);
  }
  return [...byName.values()];
}

const webSearchArgs = z.object({
  query: z.string().trim().min(1).max(200),
});
const searchArgs = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(10).nullish(),
});
const addEventArgs = z.object({
  title: z.string().min(1).max(120),
  starts_at: z.string().min(1),
  alarm_minutes_before: z.number().int().min(0).max(10080).nullish(),
});
const addTxArgs = z.object({
  kind: z.enum(["expense", "income"]),
  category: z.string().min(1).max(40),
  amount: z.number().int().nullish(), // 외화면 생략(foreign_amount 로)
  currency: z.string().trim().max(8).nullish(),
  foreign_amount: z.number().positive().nullish(),
  memo: z.string().max(200).nullish(),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
const convertArgs = z.object({
  amount: z.number().positive(),
  from: z.string().trim().max(8),
  to: z.string().trim().max(8).nullish(),
});
const updateEventArgs = z.object({
  event_id: z.number().int(),
  title: z.string().min(1).max(120).optional(),
  starts_at: z.string().min(1).optional(),
  alarm_minutes_before: z.number().int().min(0).max(10080).nullish(),
});
const eventIdArgs = z.object({ event_id: z.number().int() });
const updateTxArgs = z.object({
  transaction_id: z.number().int(),
  kind: z.enum(["expense", "income"]).optional(),
  category: z.string().min(1).max(40).optional(),
  amount: z.number().int().optional(),
  memo: z.string().max(200).nullish(),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const txIdArgs = z.object({ transaction_id: z.number().int() });
const saveMemArgs = z.object({
  content: z.string().min(1).max(200),
  importance: z.number().int().min(1).max(5).nullish(),
});
const addMemoArgs = z.object({ content: z.string().trim().min(1).max(2000) });
const listMemosArgs = z.object({ limit: z.number().int().min(1).max(50).nullish() });
const handoffArgs = z.object({
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
});
const achievementArgs = z.object({
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
});

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** ISO 문자열 → 절대 시각. 오프셋 없으면 사용자 tz의 벽시계로 해석. */
export function parseToInstant(s: string, tz: string): Date | null {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s.trim());
  if (hasTz) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // naive("YYYY-MM-DDTHH:mm") → tz 벽시계로 보고 UTC 보정(오프셋 트릭)
  const base = new Date(s + "Z"); // 일단 UTC로
  if (isNaN(base.getTime())) return null;
  const asUtc = new Date(base.toLocaleString("en-US", { timeZone: "UTC" }));
  const asTz = new Date(base.toLocaleString("en-US", { timeZone: tz }));
  const offset = asUtc.getTime() - asTz.getTime();
  return new Date(base.getTime() + offset);
}

/**
 * 도구 1건 실행 — 전부 userId 스코프(DELTA 격리). 결과/오류를 짧은 문자열로 반환
 * (모델에 tool 메시지로 전달돼 자연스러운 확인에 쓰인다). 절대 throw 하지 않는다.
 */
export async function executeTool(
  userId: number,
  name: string,
  argsJson: string,
  opts?: { personaId?: number },
): Promise<string> {
  const result = await executeToolImpl(userId, name, argsJson, opts);
  // 도구 호출·결과 1줄 로그 — 환각 의심 시 "도구를 실제로 불렀나 / 결과(id·ERROR)가 뭐였나"를
  // 로그만으로 즉시 판별. (모델이 도구 없이 'OK #43' 같은 가짜 성공을 지어내면 이 줄이 안 찍힌다.)
  console.log(`[tool] u${userId} ${name} -> ${result.replace(/\s+/g, " ").slice(0, 200)}`);
  return result;
}

async function executeToolImpl(
  userId: number,
  name: string,
  argsJson: string,
  opts?: { personaId?: number },
): Promise<string> {
  let args: unknown;
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return "ERROR: 도구 인자 JSON 파싱 실패";
  }
  try {
    if (name === "web_search") {
      const a = webSearchArgs.parse(args);
      const r = await searchWeb(a.query, 5);
      if (!r.ok) {
        // 검색 실패 — 대화는 죽지 않게, 단정 금지로 받도록 안내.
        return `웹 검색이 지금은 안 돼요(${r.reason}). 확실하지 않은 내용은 단정하지 말고, 필요하면 전문가 확인을 권해줘.`;
      }
      if (r.results.length === 0) {
        return "검색 결과 없음. 추측하지 말고 불명확하다고 솔직히 말해줘.";
      }
      return r.results
        .map(
          (x, i) =>
            `${i + 1}. ${x.title} (출처: ${x.site || "알 수 없음"})\n   ${x.snippet}`,
        )
        .join("\n");
    }
    if (name === "search_past_messages") {
      const a = searchArgs.parse(args);
      const limit = a.limit ?? 5;

      // 상담 격리 — 프롬프트가 아니라 여기(서버)서 강제. LLM 인자로 우회 불가.
      //  · 호출자가 상담가 → 자기 방 대화만(onlyPersonaId).
      //  · 호출자가 상담가 아님 → 모든 상담가 방 대화 제외(excludePersonaIds).
      const personas = await personasRepo.listByUser(userId);
      const caller = opts?.personaId
        ? personas.find((p) => p.id === opts.personaId)
        : undefined;
      // counselor 는 단독 전용이라 roles.includes("counselor") 면 순수 상담 방.
      const scope = caller?.roles.includes("counselor")
        ? { onlyPersonaId: caller.id, limit }
        : {
            excludePersonaIds: personas
              .filter((p) => p.roles.includes("counselor"))
              .map((p) => p.id),
            limit,
          };

      const hits = await messagesRepo.searchMessages(userId, a.query, scope);
      if (hits.length === 0) return "결과 없음";

      const nameById = new Map(
        personas.map((p) => [p.id, p.name?.trim() || "캐릭터"]),
      );
      const lines = hits.map((h) => {
        const date = h.createdAt
          ? new Date(h.createdAt).toISOString().slice(0, 10)
          : "????-??-??";
        const speaker =
          h.role === "user" ? "사용자" : nameById.get(h.personaId) ?? "캐릭터";
        const snippet = h.content.replace(/\s+/g, " ").trim();
        return `${date} | ${speaker} | ${snippet}`;
      });
      return lines.join("\n");
    }
    if (name === "suggest_handoff") {
      const a = handoffArgs.parse(args);
      let created = 0;
      for (const item of a.items) {
        if (await handoffsRepo.createPending(userId, opts?.personaId ?? null, item)) {
          created++;
        }
      }
      const dup = a.items.length - created;
      return `OK: ${created}건 비서에게 전달${dup > 0 ? ` (중복 ${dup}건 제외)` : ""}`;
    }
    if (name === "suggest_achievement") {
      const a = achievementArgs.parse(args);
      let created = 0;
      for (const item of a.items) {
        if (await achievementSuggestionsRepo.createPending(userId, opts?.personaId ?? null, item)) {
          created++;
        }
      }
      const dup = a.items.length - created;
      return `OK: 업적 후보 ${created}건 남김${dup > 0 ? ` (중복 ${dup}건 제외)` : ""}`;
    }
    if (name === "add_event") {
      const a = addEventArgs.parse(args);
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const when = parseToInstant(a.starts_at, tz);
      if (!when) return "ERROR: 시작 일시를 이해하지 못했어요.";
      const row = await eventsRepo.create(userId, {
        title: a.title,
        startsAt: when,
        alarmMinutesBefore: a.alarm_minutes_before ?? null,
      });
      // 등록 직후 같은 id 재조회로 '실제로 DB에 존재'를 확인하고서만 OK 를 돌려준다.
      // (insert 가 어떤 이유로 반영 안 됐는데 성공 문자열만 나가는 일을 차단 — 환각 가짜 id 방지의 마지막 빗장.)
      const verified = await eventsRepo.getOne(userId, row.id);
      if (!verified) return "ERROR: 일정 저장은 됐지만 확인에 실패했어요. 다시 시도해 주세요.";
      // Google 연결돼 있으면 미러링(best-effort, 미연동이면 no-op).
      // await 금지 — 도구 응답을 막지 않는다. 실패는 다음 동기화의 미동기분 보정이 줍는다.
      void pushCreate(userId, {
        id: row.id,
        title: row.title,
        startsAt: row.startsAt as Date,
        endsAt: row.endsAt as Date | null,
        alarmMinutesBefore: row.alarmMinutesBefore,
      });
      const label = when.toLocaleString("ko-KR", { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
      return `OK: 일정 "${a.title}" ${label} 등록(id=${row.id})${a.alarm_minutes_before ? `, ${a.alarm_minutes_before}분 전 알람` : ""}`;
    }
    if (name === "list_events") {
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const from = startOfTodayInTz(tz); // 사용자 tz 오늘 0시(서버 UTC 자정 잘림 버그 회피)
      const rows = await eventsRepo.listFrom(userId, from, 30);
      if (rows.length === 0) return "OK: 예정된 일정이 없어요.";
      const lines = rows.map((e) => {
        const when = new Date(e.startsAt as Date).toLocaleString("ko-KR", {
          timeZone: tz,
          dateStyle: "medium",
          timeStyle: "short",
        });
        return `#${e.id} ${when} ${e.title}${e.alarmMinutesBefore != null ? ` (알람 ${e.alarmMinutesBefore}분전)` : ""}`;
      });
      return "OK: 예정 일정\n" + lines.join("\n");
    }
    if (name === "update_event") {
      const a = updateEventArgs.parse(args);
      const existing = await eventsRepo.getOne(userId, a.event_id);
      if (!existing) return "ERROR: 그 일정을 찾지 못했어요. list_events로 id를 확인하세요.";
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const patch: { title?: string; startsAt?: Date; alarmMinutesBefore?: number | null } = {};
      if (a.title !== undefined) patch.title = a.title;
      if (a.starts_at !== undefined) {
        const when = parseToInstant(a.starts_at, tz);
        if (!when) return "ERROR: 새 시작 일시를 이해하지 못했어요.";
        patch.startsAt = when;
      }
      if (a.alarm_minutes_before !== undefined) patch.alarmMinutesBefore = a.alarm_minutes_before ?? null;
      await eventsRepo.update(userId, a.event_id, patch);
      const updated = await eventsRepo.getOne(userId, a.event_id);
      // Google 미러링(연결+매핑 시, best-effort). await 금지.
      if (updated) {
        void pushUpdate(userId, {
          googleEventId: updated.googleEventId,
          title: updated.title,
          startsAt: updated.startsAt as Date,
          endsAt: updated.endsAt as Date | null,
          alarmMinutesBefore: updated.alarmMinutesBefore,
        });
      }
      const label = updated
        ? new Date(updated.startsAt as Date).toLocaleString("ko-KR", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })
        : "";
      return `OK: 일정 수정(id=${a.event_id}) "${updated?.title ?? ""}" ${label}`;
    }
    if (name === "delete_event") {
      const a = eventIdArgs.parse(args);
      const ev = await eventsRepo.getOne(userId, a.event_id);
      if (!ev) return "ERROR: 그 일정을 찾지 못했어요.";
      void pushDelete(userId, ev.googleEventId); // 원격도 삭제(매핑 시)
      await eventsRepo.remove(userId, a.event_id);
      return `OK: 일정 "${ev.title}" 삭제(id=${a.event_id})`;
    }
    if (name === "add_transaction") {
      const a = addTxArgs.parse(args);
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const txDate = a.tx_date ?? todayInTz(tz);

      // 금액 결정: 외화(currency+foreign_amount)면 원화로 환산, 아니면 amount(원).
      let amountKrw = a.amount ?? null;
      let fxNote = "";
      const cur = a.currency?.toUpperCase();
      if (cur && cur !== "KRW" && a.foreign_amount != null) {
        if (!isCurrencyCode(cur)) return `ERROR: 통화 코드(${a.currency})를 모르겠어요. USD·JPY 처럼 3자리로.`;
        const conv = await convert(a.foreign_amount, cur, "KRW");
        if (!conv) return `ERROR: ${cur} 환율을 못 가져왔어요. 원화 금액을 알려주면 그대로 기록할게요.`;
        amountKrw = Math.round(conv.value);
        fxNote = `${a.foreign_amount} ${cur} @${conv.rate.toLocaleString("ko-KR")}`;
      }
      if (amountKrw == null) return "ERROR: 금액이 없어요. 원화 금액이나 외화(currency+foreign_amount)를 주세요.";

      const memo = [a.memo?.trim(), fxNote].filter(Boolean).join(" · ") || null;
      const row = await transactionsRepo.create(userId, {
        txDate,
        kind: a.kind,
        category: a.category,
        amount: amountKrw,
        memo,
      });
      const fxLabel = fxNote ? ` [${fxNote}]` : "";
      return `OK: ${a.kind === "expense" ? "지출" : "수입"} ${amountKrw.toLocaleString("ko-KR")}원${fxLabel} (${a.category}) ${txDate} 기록(id=${row.id})`;
    }
    if (name === "convert_currency") {
      const a = convertArgs.parse(args);
      const from = a.from.toUpperCase();
      const to = (a.to ?? "KRW").toUpperCase();
      if (!isCurrencyCode(from) || !isCurrencyCode(to))
        return "ERROR: 통화 코드를 모르겠어요. USD·JPY·EUR 처럼 3자리로 알려주세요.";
      const conv = await convert(a.amount, from, to);
      if (!conv) return `ERROR: ${from}→${to} 환율을 못 가져왔어요(지원 안 하는 통화일 수 있어요).`;
      const rounded = to === "KRW" ? Math.round(conv.value) : Math.round(conv.value * 100) / 100;
      return `${a.amount.toLocaleString("ko-KR")} ${from} ≈ ${rounded.toLocaleString("ko-KR")} ${to} (환율 1 ${from} = ${conv.rate.toLocaleString("ko-KR")} ${to})`;
    }
    if (name === "list_transactions") {
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const today = todayInTz(tz);
      const fromD = new Date();
      fromD.setDate(fromD.getDate() - 30);
      const from = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(fromD);
      const rows = await transactionsRepo.listBetween(userId, from, today);
      if (rows.length === 0) return "OK: 최근 30일 내역이 없어요.";
      const lines = rows
        .slice(0, 30)
        .map(
          (t) =>
            `#${t.id} ${t.txDate} ${t.kind === "expense" ? "지출" : "수입"} ${t.amount.toLocaleString("ko-KR")}원 ${t.category}${t.memo ? ` (${t.memo})` : ""}`,
        );
      return "OK: 최근 내역\n" + lines.join("\n");
    }
    if (name === "update_transaction") {
      const a = updateTxArgs.parse(args);
      const existing = await transactionsRepo.getOne(userId, a.transaction_id);
      if (!existing) return "ERROR: 그 내역을 찾지 못했어요. list_transactions로 id를 확인하세요.";
      const patch: {
        txDate?: string;
        kind?: "expense" | "income";
        category?: string;
        amount?: number;
        memo?: string | null;
      } = {};
      if (a.kind !== undefined) patch.kind = a.kind;
      if (a.category !== undefined) patch.category = a.category;
      if (a.amount !== undefined) patch.amount = a.amount;
      if (a.memo !== undefined) patch.memo = a.memo ?? null;
      if (a.tx_date !== undefined) patch.txDate = a.tx_date;
      await transactionsRepo.update(userId, a.transaction_id, patch);
      return `OK: 내역 수정(id=${a.transaction_id})`;
    }
    if (name === "delete_transaction") {
      const a = txIdArgs.parse(args);
      const existing = await transactionsRepo.getOne(userId, a.transaction_id);
      if (!existing) return "ERROR: 그 내역을 찾지 못했어요.";
      await transactionsRepo.remove(userId, a.transaction_id);
      return `OK: 내역 삭제(id=${a.transaction_id}) ${existing.amount.toLocaleString("ko-KR")}원 (${existing.category})`;
    }
    if (name === "save_memory") {
      const a = saveMemArgs.parse(args);
      // 출처 페르소나의 주 역할을 scope 로(테오→'secretary' 등). 펫 스코프와 절대 안 섞이게 비-펫 보장.
      let scope = "chat";
      if (opts?.personaId) {
        const p = await personasRepo.getOne(userId, opts.personaId);
        const role = (p?.roles as string[] | undefined)?.[0];
        if (role) scope = role;
      }
      const row = await memoriesRepo.add(userId, a.content, "chat", a.importance ?? 3, { scope });
      return `OK: 기억 저장(id=${row.id})`;
    }
    if (name === "add_memo") {
      const a = addMemoArgs.parse(args);
      const row = await memosRepo.create(userId, a.content);
      return `OK: 주머니에 메모했어요 — "${row.content}" (id=${row.id})`;
    }
    if (name === "list_memos") {
      const a = listMemosArgs.parse(args);
      const rows = await memosRepo.listOpen(userId);
      if (rows.length === 0) return "OK: 주머니가 비어 있어요.";
      const lines = rows.slice(0, a.limit ?? 10).map((m) => `#${m.id} ${m.content}`);
      return `OK: 주머니 메모(미완료 ${rows.length}개)\n` + lines.join("\n");
    }
    return `ERROR: 알 수 없는 도구 ${name}`;
  } catch (err) {
    return `ERROR: 도구 실행 실패 — ${(err as Error)?.message ?? "오류"}`;
  }
}
