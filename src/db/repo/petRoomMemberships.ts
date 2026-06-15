import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../client";
import { petRoomMemberships, pets } from "../schema";

// 펫↔방 다대다 멤버십(정본). 같은 펫이 여러 방에 동시에 있을 수 있고 한 방엔 한 번만.
//   위치(pos_x/y)는 방마다 따로. 모든 '같은 방' 읽기는 여기로(pets.room_id 는 deprecated).
//   스코프: 멤버십엔 user_id 가 없으므로 pets.user_id 로 스코프한다.
const ownsPet = (userId: number) =>
  sql`exists (select 1 from ${pets} where ${pets.id} = ${petRoomMemberships.petId} and ${pets.userId} = ${userId})`;

/** 이 방에 있는 펫들 — pets 행 + 그 방에서의 위치(pos_x/y 는 멤버십 값으로 덮음). */
export async function listPetsInRoom(userId: number, roomId: number) {
  const rows = await db
    .select()
    .from(pets)
    .innerJoin(petRoomMemberships, eq(petRoomMemberships.petId, pets.id))
    .where(and(eq(pets.userId, userId), eq(petRoomMemberships.roomId, roomId)))
    .orderBy(asc(pets.createdAt), asc(pets.id));
  return rows.map((r) => ({ ...r.pets, posX: r.pet_room_memberships.posX, posY: r.pet_room_memberships.posY }));
}

/** 그 방에서의 위치 저장(방마다 따로). */
export async function setPosition(userId: number, petId: number, roomId: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(petRoomMemberships)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(petRoomMemberships.petId, petId), eq(petRoomMemberships.roomId, roomId), ownsPet(userId)));
}

/** 펫을 방에 들임(멤버십 추가). 이미 있으면 무시(한 방 1마리). 위치 지정 가능. */
export async function addToRoom(userId: number, petId: number, roomId: number, pos?: { posX: number; posY: number }) {
  await db
    .insert(petRoomMemberships)
    .values({ petId, roomId, ...(pos ? { posX: pos.posX, posY: pos.posY } : {}) })
    .onConflictDoNothing();
}

/** 펫을 방에서 뺌(멤버십 제거). 펫·관계·성장 등 entity 는 그대로. */
export async function removeFromRoom(userId: number, petId: number, roomId: number) {
  await db
    .delete(petRoomMemberships)
    .where(and(eq(petRoomMemberships.petId, petId), eq(petRoomMemberships.roomId, roomId), ownsPet(userId)));
}

/** 이 펫이 들어가 있는 방 id 목록(PetEditSheet 다중 선택용). */
export async function roomIdsForPet(userId: number, petId: number): Promise<number[]> {
  const rows = await db
    .select({ roomId: petRoomMemberships.roomId })
    .from(petRoomMemberships)
    .where(and(eq(petRoomMemberships.petId, petId), ownsPet(userId)));
  return rows.map((r) => r.roomId);
}

/** 이 펫과 '같은 방'을 공유하는 다른 펫들(중복 제거) — diary roommates 등. */
export async function roommatesOf(userId: number, petId: number): Promise<{ id: number; name: string }[]> {
  const myRooms = await roomIdsForPet(userId, petId);
  if (myRooms.length === 0) return [];
  return db
    .selectDistinct({ id: pets.id, name: pets.name })
    .from(pets)
    .innerJoin(petRoomMemberships, eq(petRoomMemberships.petId, pets.id))
    .where(and(eq(pets.userId, userId), ne(pets.id, petId), inArray(petRoomMemberships.roomId, myRooms)));
}

/** 두 펫이 한 방이라도 같이 있나 — 아이템 owner 같은 방 판정·주인 부르기. */
export async function sharesRoom(userId: number, petAId: number, petBId: number): Promise<boolean> {
  const roomsA = await roomIdsForPet(userId, petAId);
  if (roomsA.length === 0) return false;
  const [row] = await db
    .select({ id: petRoomMemberships.id })
    .from(petRoomMemberships)
    .where(and(eq(petRoomMemberships.petId, petBId), inArray(petRoomMemberships.roomId, roomsA), ownsPet(userId)))
    .limit(1);
  return !!row;
}

/** 이 펫이 그 방에 있나 — setOwner(방 안 소유) 검증. */
export async function isPetInRoom(userId: number, petId: number, roomId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: petRoomMemberships.id })
    .from(petRoomMemberships)
    .where(and(eq(petRoomMemberships.petId, petId), eq(petRoomMemberships.roomId, roomId), ownsPet(userId)))
    .limit(1);
  return !!row;
}

/** 전체 멤버십(petId×roomId) — /pets 방별 펫 집계·홈 위젯용. */
export async function listAllForUser(userId: number): Promise<{ petId: number; roomId: number }[]> {
  return db
    .select({ petId: petRoomMemberships.petId, roomId: petRoomMemberships.roomId })
    .from(petRoomMemberships)
    .innerJoin(pets, eq(pets.id, petRoomMemberships.petId))
    .where(eq(pets.userId, userId));
}

export async function countInRoom(userId: number, roomId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(petRoomMemberships)
    .innerJoin(pets, eq(pets.id, petRoomMemberships.petId))
    .where(and(eq(pets.userId, userId), eq(petRoomMemberships.roomId, roomId)));
  return row?.n ?? 0;
}
