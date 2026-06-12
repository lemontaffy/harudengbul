import { getCurrentUser } from "@/lib/currentUser";
import * as eventsRepo from "@/db/repo/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 알림 확인(탭) → 반복 알림 중단. 서비스워커 notificationclick 에서 호출.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }
  await eventsRepo.ackAlarm(user.id, eventId);
  return Response.json({ ok: true });
}
