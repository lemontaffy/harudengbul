import { and, asc, eq, sql } from "drizzle-orm";
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
      posX: roomFurniture.posX,
      posY: roomFurniture.posY,
      pixelRender: roomFurniture.pixelRender,
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
  pixelRender: boolean;
  actionType: string | null;
}) {
  const [row] = await db
    .insert(roomFurniture)
    .values({
      roomId: input.roomId,
      kind: input.kind,
      type: input.type,
      spritePath: input.spritePath,
      pixelRender: input.pixelRender,
      actionType: input.actionType,
    })
    .returning();
  return row;
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
    .where(and(eq(petRooms.userId, userId), eq(roomFurniture.spritePath, urlPath)))
    .limit(1);
  return !!row;
}
