import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
});

function parseDate(v: string): Date | null {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function loadOwned(userId: number, idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return null;
  return eventsRepo.getOne(userId, id);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const ev = await loadOwned(user.id, id);
  if (!ev) return Response.json({ error: "없는 일정" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const d = parsed.data;

  const patch: Parameters<typeof eventsRepo.update>[2] = {};
  if (d.title !== undefined) patch.title = d.title;
  if (d.startsAt !== undefined) {
    const s = parseDate(d.startsAt);
    if (!s) return Response.json({ error: "시작 일시가 올바르지 않아요." }, { status: 400 });
    patch.startsAt = s;
  }
  if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? parseDate(d.endsAt) : null;
  if (d.alarmMinutesBefore !== undefined) patch.alarmMinutesBefore = d.alarmMinutesBefore;

  await eventsRepo.update(user.id, ev.id, patch);
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const ev = await loadOwned(user.id, id);
  if (!ev) return Response.json({ error: "없는 일정" }, { status: 404 });

  await eventsRepo.remove(user.id, ev.id);
  return Response.json({ ok: true });
}
