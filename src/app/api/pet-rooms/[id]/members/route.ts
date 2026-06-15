import { getCurrentUser } from "@/lib/currentUser";
import * as roomsRepo from "@/db/repo/petRooms";
import * as petsRepo from "@/db/repo/pets";
import * as membershipsRepo from "@/db/repo/petRoomMemberships";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 방 중심 멤버십 — 이 방에 펫 들이기(POST)/빼기(DELETE). 다대다: 다른 방 소속은 안 건드림.
async function ownedRoomAndPet(userId: number, roomId: number, petId: number) {
  if (!Number.isInteger(roomId) || !Number.isInteger(petId)) return null;
  const [room, pet] = await Promise.all([roomsRepo.getOne(userId, roomId), petsRepo.getOne(userId, petId)]);
  return room && pet ? { room, pet } : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roomId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { petId?: number };
  const petId = Number(body.petId);
  if (!(await ownedRoomAndPet(user.id, roomId, petId)))
    return Response.json({ error: "없는 방/펫" }, { status: 404 });
  await membershipsRepo.addToRoom(user.id, petId, roomId); // 이미 있으면 무시(방당 1마리)
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const roomId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { petId?: number };
  const petId = Number(body.petId);
  if (!(await ownedRoomAndPet(user.id, roomId, petId)))
    return Response.json({ error: "없는 방/펫" }, { status: 404 });
  await membershipsRepo.removeFromRoom(user.id, petId, roomId);
  return Response.json({ ok: true });
}
