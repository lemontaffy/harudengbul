import { z } from "zod";
import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";
import * as settingsRepo from "@/db/repo/settings";
import { pushUpdate, pushDelete } from "@/lib/googlesync";
import { parseRule, ruleToString, nextOccurrence } from "@/lib/recurrence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).nullable().optional(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullable().optional(),
  alarmKeepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  recurrence: z.string().max(64).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(), // false=내리기(보관) / true=재활성
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

  // 활성 전환(내리기/재활성)은 별도 처리 — 삭제와 구분(설정 보존, 재활성 가능).
  if (d.active !== undefined) {
    let rearmStartsAt: Date | undefined;
    if (d.active && ev.category === "standing" && ev.recurrence) {
      // 재활성: 과거에서 울리지 않게 다음 발생으로 startsAt 재설정.
      const rule = parseRule(ev.recurrence);
      const s = await settingsRepo.getByUser(user.id);
      const tz = s?.timezone ?? "Asia/Seoul";
      const next = rule ? nextOccurrence(rule, ev.startsAt as Date, tz, new Date()) : null;
      if (next) rearmStartsAt = next;
    }
    await eventsRepo.setActive(user.id, ev.id, d.active, rearmStartsAt);
    return Response.json({ ok: true });
  }

  const patch: Parameters<typeof eventsRepo.update>[2] = {};
  if (d.title !== undefined) patch.title = d.title;
  if (d.startsAt !== undefined) {
    const s = parseDate(d.startsAt);
    if (!s) return Response.json({ error: "시작 일시가 올바르지 않아요." }, { status: 400 });
    patch.startsAt = s;
  }
  if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? parseDate(d.endsAt) : null;
  if (d.alarmMinutesBefore !== undefined) patch.alarmMinutesBefore = d.alarmMinutesBefore;
  if (d.alarmKeepMinutes !== undefined) patch.alarmKeepMinutes = d.alarmKeepMinutes;
  if (d.recurrence !== undefined) {
    if (d.recurrence === null) patch.recurrence = null;
    else {
      const rule = parseRule(d.recurrence);
      if (!rule) return Response.json({ error: "반복 규칙이 올바르지 않아요." }, { status: 400 });
      patch.recurrence = ruleToString(rule);
    }
  }
  if (d.endDate !== undefined) patch.endDate = d.endDate;

  await eventsRepo.update(user.id, ev.id, patch);
  // Google에 미러링(연결+매핑돼 있을 때만). 갱신된 값으로.
  const updated = await eventsRepo.getOne(user.id, ev.id);
  if (updated) {
    void pushUpdate(user.id, {
      googleEventId: updated.googleEventId,
      title: updated.title,
      startsAt: updated.startsAt as Date,
      endsAt: updated.endsAt as Date | null,
      alarmMinutesBefore: updated.alarmMinutesBefore,
    });
  }
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

  // Google 매핑돼 있으면 원격도 삭제(로컬 삭제 전에 id 확보).
  void pushDelete(user.id, ev.googleEventId);
  await eventsRepo.remove(user.id, ev.id);
  return Response.json({ ok: true });
}
