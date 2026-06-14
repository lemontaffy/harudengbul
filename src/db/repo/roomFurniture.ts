import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import { roomFurniture, petRooms } from "../schema";

export type RoomFurnitureRow = typeof roomFurniture.$inferSelect;

const ownsRoom = (userId: number) =>
  sql`exists (select 1 from ${petRooms} where ${petRooms.id} = ${roomFurniture.roomId} and ${petRooms.userId} = ${userId})`;

/** 방의 가구 목록. 소유 스코프(pet_rooms 조인). */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select({
      id: roomFurniture.id,
      roomId: roomFurniture.roomId,
      kind: roomFurniture.kind,
      type: roomFurniture.type,
      spritePath: roomFurniture.spritePath,
      spriteAltPath: roomFurniture.spriteAltPath,
      posX: roomFurniture.posX,
      posY: roomFurniture.posY,
      pixelRender: roomFurniture.pixelRender,
      facing: roomFurniture.facing,
      seatY: roomFurniture.seatY,
      scale: roomFurniture.scale,
      rotation: roomFurniture.rotation,
      actionType: roomFurniture.actionType,
    })
    .from(roomFurniture)
    .innerJoin(petRooms, eq(petRooms.id, roomFurniture.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomFurniture.roomId, roomId)))
    .orderBy(asc(roomFurniture.id));
}

/** 가구 추가 — 라우트가 방 소유를 먼저 확인. */
export async function add(input: {
  roomId: number;
  kind: "seat" | "fixture";
  type: string;
  spritePath: string;
  spriteAltPath?: string | null;
  pixelRender: boolean;
  actionType: string | null;
  facing?: "left" | "right";
  seatY?: number;
}) {
  const [row] = await db
    .insert(roomFurniture)
    .values({
      roomId: input.roomId,
      kind: input.kind,
      type: input.type,
      spritePath: input.spritePath,
      spriteAltPath: input.spriteAltPath ?? null,
      pixelRender: input.pixelRender,
      actionType: input.actionType,
      ...(input.facing ? { facing: input.facing } : {}),
      ...(input.seatY != null ? { seatY: input.seatY } : {}),
    })
    .returning();
  return row;
}

/** 스프라이트 교체(main=기본, alt=알림 스프라이트). */
export async function setSprite(userId: number, id: number, slot: "main" | "alt", path: string) {
  await db
    .update(roomFurniture)
    .set(slot === "main" ? { spritePath: path } : { spriteAltPath: path })
    .where(and(eq(roomFurniture.id, id), ownsRoom(userId)));
}

/** 메타 변경(유형·라벨·액션·seat 방향/좌석높이). */
export async function updateMeta(
  userId: number,
  id: number,
  patch: {
    kind?: "seat" | "fixture";
    type?: string;
    actionType?: string | null;
    facing?: "left" | "right";
    seatY?: number;
    scale?: number;
    rotation?: number;
  },
) {
  if (Object.keys(patch).length === 0) return;
  await db
    .update(roomFurniture)
    .set(patch)
    .where(and(eq(roomFurniture.id, id), ownsRoom(userId)));
}

export async function getOne(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(roomFurniture)
    .innerJoin(petRooms, eq(petRooms.id, roomFurniture.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomFurniture.id, id)))
    .limit(1);
  return row?.room_furniture ?? null;
}

export async function setPosition(userId: number, id: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(roomFurniture)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(roomFurniture.id, id), ownsRoom(userId)));
}

export async function setPixel(userId: number, id: number, pixelRender: boolean) {
  await db
    .update(roomFurniture)
    .set({ pixelRender })
    .where(and(eq(roomFurniture.id, id), ownsRoom(userId)));
}

export async function remove(userId: number, id: number) {
  await db.delete(roomFurniture).where(and(eq(roomFurniture.id, id), ownsRoom(userId)));
}

export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roomFurniture.id })
    .from(roomFurniture)
    .innerJoin(petRooms, eq(petRooms.id, roomFurniture.roomId))
    .where(
      and(
        eq(petRooms.userId, userId),
        or(eq(roomFurniture.spritePath, urlPath), eq(roomFurniture.spriteAltPath, urlPath)),
      ),
    )
    .limit(1);
  return !!row;
}
