import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as itemsRepo from "@/db/repo/items";
import * as roomItemsRepo from "@/db/repo/roomItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 꺼내기 — 풀(asset, items kind='item')에서 골라 이 방에 인스턴스 생성. 기본 바구니(placed=false).
//   내구도 상한은 asset 의 기본값(durability_max)을 가져옴(타입 기본 취약도, 없으면 무한).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roomId = Number((await params).id);
  if (!Number.isInteger(roomId)) return Response.json({ error: "잘못된 입력" }, { status: 400 });
  if (!(await roomsRepo.getOne(user.id, roomId))) return Response.json({ error: "없는 방" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { assetId?: number; placed?: boolean; posX?: number; posY?: number };
  const assetId = Number(body.assetId);
  if (!Number.isInteger(assetId)) return Response.json({ error: "아이템을 고르세요." }, { status: 400 });
  const asset = await itemsRepo.getOne(user.id, assetId);
  if (!asset || asset.kind !== "item") return Response.json({ error: "없는 아이템" }, { status: 404 });

  const inst = await roomItemsRepo.pull({
    roomId,
    assetId,
    durabilityMax: asset.durabilityMax ?? null,
    placed: body.placed ?? false,
    ...(typeof body.posX === "number" ? { posX: body.posX } : {}),
    ...(typeof body.posY === "number" ? { posY: body.posY } : {}),
  });
  return Response.json({ ok: true, instance: inst });
}
