import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";
import * as settingsRepo from "@/db/repo/settings";
import { pushCreate } from "@/lib/googlesync";
import { startOfTodayInTz } from "@/lib/proactive";
import { parseRule, ruleToString } from "@/lib/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  startsAt: z.string().min(1), // ISO instant (클라이언트가 toISOString 으로 전송)
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
  alarmKeepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  // 상시알람: category='standing' + recurrence(규칙) + (선택) endDate.
  category: z.enum(["oneoff", "standing"]).optional(),
  recurrence: z.string().max(64).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function parseDate(v: string): Date | null {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function publicRow(e: eventsRepo.EventRow) {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    alarmMinutesBefore: e.alarmMinutesBefore,
    alarmKeepMinutes: e.alarmKeepMinutes,
    category: e.category,
    recurrence: e.recurrence,
    endDate: e.endDate,
    active: e.active,
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  // 보관함(내려진 알람) 조회.
  if (url.searchParams.get("archived") === "1") {
    const rows = await eventsRepo.listArchived(user.id);
    return Response.json({ events: rows.map(publicRow) });
  }
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");
  // 범위 지정(캘린더 월 뷰): start~end. 둘 다 유효할 때만, 아니면 기존 동작(오늘 이후).
  if (startQ && endQ) {
    const start = parseDate(startQ);
    const end = parseDate(endQ);
    if (!start || !end) return Response.json({ error: "잘못된 범위" }, { status: 400 });
    const rows = await eventsRepo.listBetween(user.id, start, end);
    return Response.json({ events: rows.map(publicRow) });
  }
  // 예정 일정: 사용자 tz 기준 '오늘 0시' 이후(서버 UTC 자정 기준이면 새벽·오전 일정이 잘리던 버그).
  const s = await settingsRepo.getByUser(user.id);
  const from = startOfTodayInTz(s?.timezone ?? "Asia/Seoul");
  const rows = await eventsRepo.listFrom(user.id, from);
  return Response.json({ events: rows.map(publicRow) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "잘못된 입력" }, { status: 400 });
  }
  const d = parsed.data;
  const startsAt = parseDate(d.startsAt);
  if (!startsAt) return Response.json({ error: "시작 일시가 올바르지 않아요." }, { status: 400 });
  const endsAt = d.endsAt ? parseDate(d.endsAt) : null;

  // 상시알람: 반복 규칙 검증. 설정한 시각에 울리도록 알람 '몇 분 전'은 0으로(미지정 시).
  const standing = d.category === "standing";
  let recurrence: string | null = null;
  if (standing) {
    const rule = parseRule(d.recurrence);
    if (!rule) return Response.json({ error: "반복 규칙이 올바르지 않아요." }, { status: 400 });
    recurrence = ruleToString(rule);
  }
  const alarmMinutesBefore = standing ? (d.alarmMinutesBefore ?? 0) : (d.alarmMinutesBefore ?? null);

  const row = await eventsRepo.create(user.id, {
    title: d.title,
    startsAt,
    endsAt,
    alarmMinutesBefore,
    alarmKeepMinutes: d.alarmKeepMinutes ?? null,
    category: standing ? "standing" : "oneoff",
    recurrence,
    endDate: standing ? (d.endDate ?? null) : null,
  });
  // Google 미러링은 일회성만(상시 반복은 로컬 전용 — 캘린더 폭주 방지).
  if (!standing) {
    void pushCreate(user.id, {
      id: row.id,
      title: row.title,
      startsAt: row.startsAt as Date,
      endsAt: row.endsAt as Date | null,
      alarmMinutesBefore: row.alarmMinutesBefore,
    });
  }
  return Response.json({ event: publicRow(row) });
}
