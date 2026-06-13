import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";
import { pushCreate } from "@/lib/googlesync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  startsAt: z.string().min(1), // ISO instant (클라이언트가 toISOString 으로 전송)
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
  alarmKeepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
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
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
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
  // 예정 일정: 오늘 0시 이후(살짝 과거도 포함되게 하루 전부터).
  const from = new Date();
  from.setHours(0, 0, 0, 0);
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

  const row = await eventsRepo.create(user.id, {
    title: d.title,
    startsAt,
    endsAt,
    alarmMinutesBefore: d.alarmMinutesBefore ?? null,
    alarmKeepMinutes: d.alarmKeepMinutes ?? null,
  });
  // Google 연결돼 있으면 미러링(best-effort, 연결 안 됐으면 no-op).
  void pushCreate(user.id, {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt as Date,
    endsAt: row.endsAt as Date | null,
    alarmMinutesBefore: row.alarmMinutesBefore,
  });
  return Response.json({ event: publicRow(row) });
}
