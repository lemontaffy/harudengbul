import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../client";
import { roomItems, items, petRooms } from "../schema";

// v6 아이템 인스턴스(방 단위). 상태(소유·내구도·파손·placed·위치)는 전부 여기. asset(items)는 상태 없는 풀.
//   스코프: 인스턴스가 가리키는 방(pet_rooms)의 소유.

export type RoomItemRow = typeof roomItems.$inferSelect;

const ownsRoom = (userId: number) =>
  sql`exists (select 1 from ${petRooms} where ${petRooms.id} = ${roomItems.roomId} and ${petRooms.userId} = ${userId})`;

/** 방의 아이템 인스턴스 + asset(스프라이트·픽셀·이름) 조인. placed 로 방 렌더 / 바구니 구분. */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select({
      id: roomItems.id,
      assetId: roomItems.assetId,
      name: items.name,
      spritePath: items.spritePath,
      pixelRender: items.pixelRender,
      brokenSpritePath: items.brokenSpritePath, // 풀에 등록된 파손 모양(있으면)
      ownerPetId: roomItems.ownerPetId,
      durabilityMax: roomItems.durabilityMax,
      durabilityNow: roomItems.durabilityNow,
      broken: roomItems.broken,
      placed: roomItems.placed,
      posX: roomItems.posX,
      posY: roomItems.posY,
      scale: roomItems.scale,
      zOrder: roomItems.zOrder,
    })
    .from(roomItems)
    .innerJoin(items, eq(items.id, roomItems.assetId))
    .innerJoin(petRooms, eq(petRooms.id, roomItems.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomItems.roomId, roomId)))
    .orderBy(asc(roomItems.zOrder), asc(roomItems.id));
}

export async function getOne(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(roomItems)
    .innerJoin(petRooms, eq(petRooms.id, roomItems.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomItems.id, id)))
    .limit(1);
  return row?.room_items ?? null;
}

/** 풀(asset)에서 꺼내 방에 인스턴스 생성. 라우트가 방·asset 소유를 먼저 보장.
 *   내구도 상한은 asset 의 기본값(items.durability_max)을 가져옴(없으면 무한). placed 기본 false(바구니). */
export async function pull(input: {
  roomId: number;
  assetId: number;
  durabilityMax: number | null;
  placed?: boolean;
  posX?: number;
  posY?: number;
}) {
  const [row] = await db
    .insert(roomItems)
    .values({
      roomId: input.roomId,
      assetId: input.assetId,
      durabilityMax: input.durabilityMax,
      durabilityNow: input.durabilityMax ?? 0,
      placed: input.placed ?? false,
      ...(input.posX != null ? { posX: input.posX } : {}),
      ...(input.posY != null ? { posY: input.posY } : {}),
    })
    .returning();
  return row;
}

/** 배치 ↔ 내림(단일 위치). placed=true 시 위치도 함께 지정 가능. */
export async function setPlaced(userId: number, id: number, placed: boolean, pos?: { posX: number; posY: number }) {
  await db
    .update(roomItems)
    .set({ placed, ...(pos ? { posX: pos.posX, posY: pos.posY } : {}) })
    .where(and(eq(roomItems.id, id), ownsRoom(userId)));
}

export async function setPosition(userId: number, id: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(roomItems)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(roomItems.id, id), ownsRoom(userId)));
}

export async function setScale(userId: number, id: number, scale: number) {
  await db
    .update(roomItems)
    .set({ scale: Math.max(0.3, Math.min(3, scale)) })
    .where(and(eq(roomItems.id, id), ownsRoom(userId)));
}

/** 방 안 소유 펫 지정/해제. 라우트가 펫 소유(같은 유저)를 검증.
 *  단일 소유: 한 펫은 한 번에 한 아이템만 — 새로 줄 때 그 펫이 들고 있던 다른 인스턴스는 자동 해제. */
export async function setOwner(userId: number, id: number, petId: number | null) {
  if (petId != null) {
    await db
      .update(roomItems)
      .set({ ownerPetId: null })
      .where(and(eq(roomItems.ownerPetId, petId), ne(roomItems.id, id), ownsRoom(userId)));
  }
  await db
    .update(roomItems)
    .set({ ownerPetId: petId })
    .where(and(eq(roomItems.id, id), ownsRoom(userId)));
}

/** 마모 1 — durability_now 1 감소(0 미만 금지), 0 도달 시 broken=true. 무한이면 무동작(null). */
export async function wear(userId: number, id: number): Promise<{ now: number; broke: boolean } | null> {
  const [row] = await db
    .update(roomItems)
    .set({
      durabilityNow: sql`greatest(0, ${roomItems.durabilityNow} - 1)`,
    })
    .where(and(eq(roomItems.id, id), ownsRoom(userId), sql`${roomItems.durabilityMax} is not null`))
    .returning({ now: roomItems.durabilityNow, was: roomItems.durabilityNow });
  if (!row) return null;
  const broke = row.now === 0;
  if (broke) await db.update(roomItems).set({ broken: true }).where(eq(roomItems.id, id));
  return { now: row.now, broke };
}

/** 수리 — durability_now = max, broken=false. 무한이면 무동작. */
export async function repair(userId: number, id: number): Promise<boolean> {
  const res = await db
    .update(roomItems)
    .set({ durabilityNow: sql`${roomItems.durabilityMax}`, broken: false })
    .where(and(eq(roomItems.id, id), ownsRoom(userId), sql`${roomItems.durabilityMax} is not null`))
    .returning({ id: roomItems.id });
  return res.length > 0;
}

/** 인스턴스 제거(방에서 완전히 치움 — 풀 asset 은 남음). */
export async function remove(userId: number, id: number) {
  await db.delete(roomItems).where(and(eq(roomItems.id, id), ownsRoom(userId)));
}
