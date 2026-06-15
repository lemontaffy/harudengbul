import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as itemsRepo from "@/db/repo/items";
import * as placementsRepo from "@/db/repo/furniturePlacements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 전역 라이브러리 가구(items kind='furniture')를 이 방에 배치(인스턴스 생성).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roomId = Number((await params).id);
  if (!Number.isInteger(roomId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  const room = await roomsRepo.getOne(user.id, roomId);
  if (!room) return Response.json({ error: "없는 방" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { itemId?: number; posX?: number; posY?: number };
  const itemId = Number(body.itemId);
  if (!Number.isInteger(itemId)) return Response.json({ error: "아이템을 고르세요." }, { status: 400 });
  const item = await itemsRepo.getOne(user.id, itemId);
  if (!item || (item.kind !== "furniture" && item.kind !== "item"))
    return Response.json({ error: "없는 아이템" }, { status: 404 });

  // 현재 보는 패널 중앙에 배치(클라가 posX 전달). 미전달 시 방 가운데.
  const clamp = (v: number) => Math.max(2, Math.min(98, v));
  const posX = Number.isFinite(body.posX) ? clamp(Number(body.posX)) : 50;
  const posY = Number.isFinite(body.posY) ? clamp(Number(body.posY)) : 60;
  const placement = await placementsRepo.add({ roomId, itemId, posX, posY });
  return Response.json({ ok: true, placement });
}
