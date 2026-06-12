import { z } from "zod";
import * as eventsRepo from "@/db/repo/events";
import * as transactionsRepo from "@/db/repo/transactions";
import * as memoriesRepo from "@/db/repo/memories";
import * as settingsRepo from "@/db/repo/settings";
import * as handoffsRepo from "@/db/repo/handoffs";
import { pushCreate } from "@/lib/googlesync";
import type { Role } from "@/lib/persona";

// SPEC §7 — 비서 도구. OpenAI 호환 tool-use 스펙.
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

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
      name: "add_transaction",
      description: "가계부에 지출/수입을 기록한다. '점심 9천원 썼어' 같은 요청에 사용.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["expense", "income"], description: "지출 또는 수입" },
          category: { type: "string", description: "카테고리(예: 식비, 교통, 월급)" },
          amount: { type: "integer", description: "금액(원, KRW 정수)" },
          memo: { type: "string", description: "메모(선택)" },
          tx_date: { type: "string", description: "YYYY-MM-DD(선택, 생략 시 오늘)" },
        },
        required: ["kind", "category", "amount"],
      },
    },
  },
  {
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
  },
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

/** 역할·설정에 따른 도구 목록. 비서=등록 도구, 상담가=핸드오프(켜졌을 때만). */
export function toolsForRole(role: Role, handoffEnabled: boolean): ToolDef[] | undefined {
  if (role === "secretary") return SECRETARY_TOOLS;
  if (role === "counselor" && handoffEnabled) return [HANDOFF_TOOL];
  return undefined;
}

const addEventArgs = z.object({
  title: z.string().min(1).max(120),
  starts_at: z.string().min(1),
  alarm_minutes_before: z.number().int().min(0).max(10080).nullish(),
});
const addTxArgs = z.object({
  kind: z.enum(["expense", "income"]),
  category: z.string().min(1).max(40),
  amount: z.number().int(),
  memo: z.string().max(200).nullish(),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
const saveMemArgs = z.object({
  content: z.string().min(1).max(200),
  importance: z.number().int().min(1).max(5).nullish(),
});
const handoffArgs = z.object({
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
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
  let args: unknown;
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return "ERROR: 도구 인자 JSON 파싱 실패";
  }
  try {
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
    if (name === "add_transaction") {
      const a = addTxArgs.parse(args);
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const txDate = a.tx_date ?? todayInTz(tz);
      const row = await transactionsRepo.create(userId, {
        txDate,
        kind: a.kind,
        category: a.category,
        amount: a.amount,
        memo: a.memo ?? null,
      });
      return `OK: ${a.kind === "expense" ? "지출" : "수입"} ${a.amount.toLocaleString("ko-KR")}원 (${a.category}) ${txDate} 기록(id=${row.id})`;
    }
    if (name === "save_memory") {
      const a = saveMemArgs.parse(args);
      const row = await memoriesRepo.add(userId, a.content, "chat", a.importance ?? 3);
      return `OK: 기억 저장(id=${row.id})`;
    }
    return `ERROR: 알 수 없는 도구 ${name}`;
  } catch (err) {
    return `ERROR: 도구 실행 실패 — ${(err as Error)?.message ?? "오류"}`;
  }
}
