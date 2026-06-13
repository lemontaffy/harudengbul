import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as handoffsRepo from "@/db/repo/handoffs";
import * as eventsRepo from "@/db/repo/events";
import * as memosRepo from "@/db/repo/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  startsAt: z.string().min(1), // ISO instant
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
});

function parseDate(v: string): Date | null {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// 승인 = 핸드오프 항목으로 일정 생성 + 연결(status=accepted).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });

  const h = await handoffsRepo.getOne(user.id, id);
  if (!h) return Response.json({ error: "없는 항목" }, { status: 404 });
  if (h.status !== "pending") return Response.json({ error: "이미 처리됨" }, { status: 409 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;
  const startsAt = parseDate(d.startsAt);
  if (!startsAt) return Response.json({ error: "시작 일시가 올바르지 않아요." }, { status: 400 });
  const endsAt = d.endsAt ? parseDate(d.endsAt) : null;

  const event = await eventsRepo.create(user.id, {
    title: d.title,
    startsAt,
    endsAt,
    alarmMinutesBefore: d.alarmMinutesBefore ?? null,
  });
  const ok = await handoffsRepo.accept(user.id, id, event.id);
  if (!ok) return Response.json({ error: "이미 처리됨" }, { status: 409 });
  // 메모 승격으로 생긴 핸드오프면 원본 메모 자동 체크(승격돼도 메모는 남고, 등록 승인 시 완료).
  if (h.sourceMemoId) await memosRepo.markDone(user.id, h.sourceMemoId);
  return Response.json({ ok: true, eventId: event.id });
}
