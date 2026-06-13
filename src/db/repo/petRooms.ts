import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { petRooms } from "../schema";

export type PetRoomRow = typeof petRooms.$inferSelect;

export async function listByUser(userId: number) {
  return db
    .select()
    .from(petRooms)
    .where(eq(petRooms.userId, userId))
    .orderBy(asc(petRooms.createdAt), asc(petRooms.id));
}

export async function getOne(userId: number, id: number) {
  return db.query.petRooms.findFirst({
    where: and(eq(petRooms.id, id), eq(petRooms.userId, userId)),
  });
}

export async function create(userId: number, name: string) {
  const [row] = await db.insert(petRooms).values({ userId, name }).returning();
  return row;
}

export async function rename(userId: number, id: number, name: string) {
  await db
    .update(petRooms)
    .set({ name })
    .where(and(eq(petRooms.id, id), eq(petRooms.userId, userId)));
}

export async function setBackground(
  userId: number,
  id: number,
  backgroundPath: string | null,
  pixelRenderBg?: boolean,
) {
  await db
    .update(petRooms)
    .set({ backgroundPath, ...(pixelRenderBg !== undefined ? { pixelRenderBg } : {}) })
    .where(and(eq(petRooms.id, id), eq(petRooms.userId, userId)));
}

export async function setLiveliness(userId: number, id: number, liveliness: number) {
  await db
    .update(petRooms)
    .set({ liveliness: Math.max(0, Math.min(100, liveliness)) })
    .where(and(eq(petRooms.id, id), eq(petRooms.userId, userId)));
}

export async function remove(userId: number, id: number) {
  // 펫이 있으면 FK(no action)가 막는다 — 라우트에서 먼저 countByRoom 으로 차단·안내.
  await db.delete(petRooms).where(and(eq(petRooms.id, id), eq(petRooms.userId, userId)));
}
