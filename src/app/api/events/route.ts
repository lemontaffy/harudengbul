import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  startsAt: z.string().min(1), // ISO instant (클라이언트가 toISOString 으로 전송)
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
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
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
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
  });
  return Response.json({ event: publicRow(row) });
}
