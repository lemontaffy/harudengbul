import { z } from "zod";
import * as eventsRepo from "@/db/repo/events";
import * as transactionsRepo from "@/db/repo/transactions";
import * as memoriesRepo from "@/db/repo/memories";
import * as settingsRepo from "@/db/repo/settings";
import * as handoffsRepo from "@/db/repo/handoffs";
import { pushCreate, pushUpdate, pushDelete } from "@/lib/googlesync";
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
    if (name === "list_events") {
      const s = await settingsRepo.getByUser(userId);
      const tz = s?.timezone ?? "Asia/Seoul";
      const from = new Date();
      from.setHours(0, 0, 0, 0);
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
      const row = await transactionsRepo.create(userId, {
        txDate,
        kind: a.kind,
        category: a.category,
        amount: a.amount,
        memo: a.memo ?? null,
      });
      return `OK: ${a.kind === "expense" ? "지출" : "수입"} ${a.amount.toLocaleString("ko-KR")}원 (${a.category}) ${txDate} 기록(id=${row.id})`;
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
      const row = await memoriesRepo.add(userId, a.content, "chat", a.importance ?? 3);
      return `OK: 기억 저장(id=${row.id})`;
    }
    return `ERROR: 알 수 없는 도구 ${name}`;
  } catch (err) {
    return `ERROR: 도구 실행 실패 — ${(err as Error)?.message ?? "오류"}`;
  }
}
