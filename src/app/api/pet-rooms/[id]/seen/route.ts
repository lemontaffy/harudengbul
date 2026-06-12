import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as settingsRepo from "@/db/repo/settings";
import { stageFor } from "@/lib/pets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 방 진입 확인 — 잠 환영/진화 연출이 SSR 플래그로 1회 표시된 뒤 클라이언트가 호출.
 * 활동 갱신(잠 리셋) + 마지막 본 방 기록 + 진화 본 스테이지 저장(놓친 진화는 복귀 시 발동).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, id);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  await settingsRepo.updateByUser(user.id, {
    lastActivityAt: new Date(),
    petLastRoomId: id,
  });

  const pets = await petsRepo.listByRoom(user.id, id);
  for (const p of pets) {
    const stage = stageFor(p.growthPoints, p.teenThreshold, p.adultThreshold);
    if (p.lastStageSeen !== stage) await petsRepo.setLastStageSeen(user.id, p.id, stage);
  }
  return Response.json({ ok: true });
}
