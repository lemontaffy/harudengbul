import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { pets } from "../schema";

export type PetRow = typeof pets.$inferSelect;

export async function listByUser(userId: number) {
  return db
    .select()
    .from(pets)
    .where(eq(pets.userId, userId))
    .orderBy(asc(pets.createdAt), asc(pets.id));
}

export async function listByRoom(userId: number, roomId: number) {
  return db
    .select()
    .from(pets)
    .where(and(eq(pets.userId, userId), eq(pets.roomId, roomId)))
    .orderBy(asc(pets.createdAt), asc(pets.id));
}

export async function countByRoom(userId: number, roomId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pets)
    .where(and(eq(pets.userId, userId), eq(pets.roomId, roomId)));
  return r?.n ?? 0;
}

export async function getOne(userId: number, id: number) {
  return db.query.pets.findFirst({
    where: and(eq(pets.id, id), eq(pets.userId, userId)),
  });
}

export async function create(
  userId: number,
  input: { roomId: number | null; name: string; personality?: string | null },
) {
  const [row] = await db
    .insert(pets)
    .values({
      userId,
      roomId: input.roomId,
      name: input.name,
      personality: input.personality ?? null,
      lastStageSeen: "baby", // 생성 직후엔 baby '봤음'으로 — 진화 연출은 변화 시에만
    })
    .returning();
  return row;
}

export async function update(
  userId: number,
  id: number,
  patch: Partial<
    Pick<
      PetRow,
      | "name"
      | "personality"
      | "pixelRender"
      | "teenThreshold"
      | "adultThreshold"
      | "roomId"
      | "talkativeness"
      | "activeness"
      | "displayStage"
      | "walkFacing"
    >
  >,
) {
  await db
    .update(pets)
    .set(patch)
    .where(and(eq(pets.id, id), eq(pets.userId, userId)));
}

export async function setPosition(userId: number, id: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(pets)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(pets.id, id), eq(pets.userId, userId)));
}

export async function setLastStageSeen(userId: number, id: number, stage: string) {
  await db
    .update(pets)
    .set({ lastStageSeen: stage })
    .where(and(eq(pets.id, id), eq(pets.userId, userId)));
}

/** 성장 적립(전 펫 공통) — 감소 없음. grantGrowth(lib/growth)에서 상한 적용 후 호출. */
export async function addGrowthAll(userId: number, n: number) {
  if (n <= 0) return;
  await db
    .update(pets)
    .set({ growthPoints: sql`${pets.growthPoints} + ${n}` })
    .where(eq(pets.userId, userId));
}

export async function remove(userId: number, id: number) {
  await db.delete(pets).where(and(eq(pets.id, id), eq(pets.userId, userId)));
}
