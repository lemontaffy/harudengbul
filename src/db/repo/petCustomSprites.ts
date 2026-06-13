import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { petCustomSprites, pets } from "../schema";

export type PetCustomSpriteRow = typeof petCustomSprites.$inferSelect;

const COLS = {
  id: petCustomSprites.id,
  petId: petCustomSprites.petId,
  stage: petCustomSprites.stage,
  name: petCustomSprites.name,
  path: petCustomSprites.path,
  frequency: petCustomSprites.frequency,
  line: petCustomSprites.line,
};

export async function listForPet(userId: number, petId: number) {
  return db
    .select(COLS)
    .from(petCustomSprites)
    .innerJoin(pets, eq(pets.id, petCustomSprites.petId))
    .where(and(eq(pets.userId, userId), eq(petCustomSprites.petId, petId)))
    .orderBy(asc(petCustomSprites.id));
}

/** 방의 모든 펫 커스텀 모션(틱 재생용). */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select(COLS)
    .from(petCustomSprites)
    .innerJoin(pets, eq(pets.id, petCustomSprites.petId))
    .where(and(eq(pets.userId, userId), eq(pets.roomId, roomId)));
}

export async function create(
  petId: number,
  v: { stage: string; name: string; path: string; frequency: string; line: string | null },
) {
  const [row] = await db.insert(petCustomSprites).values({ petId, ...v }).returning();
  return row;
}

export async function remove(userId: number, id: number) {
  await db
    .delete(petCustomSprites)
    .where(
      and(
        eq(petCustomSprites.id, id),
        sql`exists (select 1 from ${pets} where ${pets.id} = ${petCustomSprites.petId} and ${pets.userId} = ${userId})`,
      ),
    );
}

export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: petCustomSprites.id })
    .from(petCustomSprites)
    .innerJoin(pets, eq(pets.id, petCustomSprites.petId))
    .where(and(eq(pets.userId, userId), eq(petCustomSprites.path, urlPath)))
    .limit(1);
  return !!row;
}
