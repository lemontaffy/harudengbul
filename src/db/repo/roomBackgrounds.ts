import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { roomBackgrounds, petRooms } from "../schema";

export type RoomBackgroundRow = typeof roomBackgrounds.$inferSelect;

const ownsRoom = (userId: number) =>
  sql`exists (select 1 from ${petRooms} where ${petRooms.id} = ${roomBackgrounds.roomId} and ${petRooms.userId} = ${userId})`;

/** 방의 배경 패널들(스트립 순서). 소유 스코프(pet_rooms 조인). */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select({
      id: roomBackgrounds.id,
      roomId: roomBackgrounds.roomId,
      path: roomBackgrounds.path,
      sortOrder: roomBackgrounds.sortOrder,
      pixelRender: roomBackgrounds.pixelRender,
    })
    .from(roomBackgrounds)
    .innerJoin(petRooms, eq(petRooms.id, roomBackgrounds.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomBackgrounds.roomId, roomId)))
    .orderBy(asc(roomBackgrounds.sortOrder), asc(roomBackgrounds.id));
}

export async function countForRoom(userId: number, roomId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(roomBackgrounds)
    .innerJoin(petRooms, eq(petRooms.id, roomBackgrounds.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomBackgrounds.roomId, roomId)));
  return r?.n ?? 0;
}

/** 패널 추가 — sort_order = 현재 최대+1(맨 뒤). 라우트가 방 소유를 먼저 확인. */
export async function append(roomId: number, path: string, pixelRender: boolean) {
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${roomBackgrounds.sortOrder}), -1) + 1` })
    .from(roomBackgrounds)
    .where(eq(roomBackgrounds.roomId, roomId));
  const [row] = await db
    .insert(roomBackgrounds)
    .values({ roomId, path, sortOrder: next ?? 0, pixelRender })
    .returning();
  return row;
}

export async function remove(userId: number, id: number) {
  await db.delete(roomBackgrounds).where(and(eq(roomBackgrounds.id, id), ownsRoom(userId)));
}

/** 순서 재배치 — orderedIds 인덱스대로 sort_order 설정(소유 건만). */
export async function reorder(userId: number, orderedIds: number[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(roomBackgrounds)
        .set({ sortOrder: i })
        .where(and(eq(roomBackgrounds.id, orderedIds[i]), ownsRoom(userId)));
    }
  });
}

export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roomBackgrounds.id })
    .from(roomBackgrounds)
    .innerJoin(petRooms, eq(petRooms.id, roomBackgrounds.roomId))
    .where(and(eq(petRooms.userId, userId), eq(roomBackgrounds.path, urlPath)))
    .limit(1);
  return !!row;
}
