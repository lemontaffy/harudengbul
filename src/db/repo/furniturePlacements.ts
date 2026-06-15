import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { furniturePlacements, items, petRooms } from "../schema";

// 가구 배치 인스턴스 — 전역 items(가구)를 방에 둠. 같은 가구를 여러 방에 둘 수 있음.
//   스코프: 배치가 가리키는 방(pet_rooms)의 소유 + 아이템(items)의 소유 모두 같은 유저여야 함.

export type PlacementRow = typeof furniturePlacements.$inferSelect;

const ownsRoom = (userId: number) =>
  sql`exists (select 1 from ${petRooms} where ${petRooms.id} = ${furniturePlacements.roomId} and ${petRooms.userId} = ${userId})`;

/**
 * 방의 가구 배치 + items 메타 조인 → 방 렌더용 VM.
 * (placementId 는 위치/변형 수정 대상, itemId 는 라이브러리 원본.)
 */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select({
      placementId: furniturePlacements.id,
      itemId: items.id,
      roomId: furniturePlacements.roomId,
      posX: furniturePlacements.posX,
      posY: furniturePlacements.posY,
      zOrder: furniturePlacements.zOrder,
      scale: furniturePlacements.scale,
      rotation: furniturePlacements.rotation,
      name: items.name,
      itemKind: items.kind, // 'furniture' | 'item' — 가구/아이템 배치 구분
      kind: items.furnitureKind, // 'seat' | 'fixture'(가구)
      type: items.type,
      spritePath: items.spritePath,
      spriteAltPath: items.spriteAltPath,
      pixelRender: items.pixelRender,
      facing: items.facing,
      seatY: items.seatY,
      actionType: items.actionType,
      // 아이템(kind='item') 배치 시 내구도/파손
      ownerPetId: items.ownerPetId,
      brokenSpritePath: items.brokenSpritePath,
      durabilityMax: items.durabilityMax,
      durabilityNow: items.durabilityNow,
    })
    .from(furniturePlacements)
    .innerJoin(items, eq(items.id, furniturePlacements.itemId))
    .innerJoin(petRooms, eq(petRooms.id, furniturePlacements.roomId))
    .where(and(eq(petRooms.userId, userId), eq(furniturePlacements.roomId, roomId)))
    .orderBy(asc(furniturePlacements.zOrder), asc(furniturePlacements.id));
}

/** 라이브러리 가구를 방에 배치. 라우트가 방 소유 + 아이템 소유(같은 유저)를 먼저 보장. */
export async function add(input: {
  roomId: number;
  itemId: number;
  posX?: number;
  posY?: number;
  zOrder?: number;
  scale?: number;
  rotation?: number;
}) {
  const [row] = await db
    .insert(furniturePlacements)
    .values({
      roomId: input.roomId,
      itemId: input.itemId,
      ...(input.posX != null ? { posX: input.posX } : {}),
      ...(input.posY != null ? { posY: input.posY } : {}),
      ...(input.zOrder != null ? { zOrder: input.zOrder } : {}),
      ...(input.scale != null ? { scale: input.scale } : {}),
      ...(input.rotation != null ? { rotation: input.rotation } : {}),
    })
    .returning();
  return row;
}

/** 아이템이 어느 방에 배치돼 있나(관리 화면 표시 + 삭제 확인용). 방 이름 목록. */
export async function roomsForItem(userId: number, itemId: number) {
  return db
    .select({ roomId: petRooms.id, roomName: petRooms.name })
    .from(furniturePlacements)
    .innerJoin(petRooms, eq(petRooms.id, furniturePlacements.roomId))
    .where(and(eq(petRooms.userId, userId), eq(furniturePlacements.itemId, itemId)))
    .orderBy(asc(petRooms.id));
}

/** 이 방에 같은 기능(actionType)의 fixture 가구가 이미 배치됐는지 — 기능물 1방 유일 제약용. */
export async function fixtureActionExists(
  userId: number,
  roomId: number,
  actionType: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: furniturePlacements.id })
    .from(furniturePlacements)
    .innerJoin(items, eq(items.id, furniturePlacements.itemId))
    .innerJoin(petRooms, eq(petRooms.id, furniturePlacements.roomId))
    .where(
      and(
        eq(petRooms.userId, userId),
        eq(furniturePlacements.roomId, roomId),
        eq(items.actionType, actionType),
      ),
    )
    .limit(1);
  return !!row;
}

/** 유저의 모든 가구 배치(item별 배치된 방). 관리 화면에서 가구별 '배치된 방' 표시용. */
export async function allForUser(userId: number) {
  return db
    .select({ itemId: furniturePlacements.itemId, roomId: petRooms.id, roomName: petRooms.name })
    .from(furniturePlacements)
    .innerJoin(petRooms, eq(petRooms.id, furniturePlacements.roomId))
    .where(eq(petRooms.userId, userId))
    .orderBy(asc(furniturePlacements.itemId), asc(petRooms.id));
}

export async function setPosition(userId: number, placementId: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(furniturePlacements)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(furniturePlacements.id, placementId), ownsRoom(userId)));
}

export async function setTransform(
  userId: number,
  placementId: number,
  patch: { scale?: number; rotation?: number; zOrder?: number },
) {
  if (Object.keys(patch).length === 0) return;
  await db
    .update(furniturePlacements)
    .set(patch)
    .where(and(eq(furniturePlacements.id, placementId), ownsRoom(userId)));
}

export async function remove(userId: number, placementId: number) {
  await db
    .delete(furniturePlacements)
    .where(and(eq(furniturePlacements.id, placementId), ownsRoom(userId)));
}
