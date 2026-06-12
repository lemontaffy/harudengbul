import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { petSprites, pets, petRooms } from "../schema";

export type PetSpriteRow = typeof petSprites.$inferSelect;

/** 펫의 모든 스프라이트 슬롯(소유 스코프). */
export async function listForPet(userId: number, petId: number) {
  return db
    .select({
      id: petSprites.id,
      petId: petSprites.petId,
      stage: petSprites.stage,
      kind: petSprites.kind,
      path: petSprites.path,
    })
    .from(petSprites)
    .innerJoin(pets, eq(pets.id, petSprites.petId))
    .where(and(eq(pets.userId, userId), eq(petSprites.petId, petId)));
}

/** 한 방의 모든 펫 스프라이트(렌더용). */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select({
      petId: petSprites.petId,
      stage: petSprites.stage,
      kind: petSprites.kind,
      path: petSprites.path,
    })
    .from(petSprites)
    .innerJoin(pets, eq(pets.id, petSprites.petId))
    .where(and(eq(pets.userId, userId), eq(pets.roomId, roomId)));
}

export async function upsertSlot(petId: number, stage: string, kind: string, path: string) {
  await db
    .insert(petSprites)
    .values({ petId, stage, kind, path })
    .onConflictDoUpdate({
      target: [petSprites.petId, petSprites.stage, petSprites.kind],
      set: { path },
    });
}

export async function deleteSlot(petId: number, stage: string, kind: string) {
  await db
    .delete(petSprites)
    .where(
      and(eq(petSprites.petId, petId), eq(petSprites.stage, stage), eq(petSprites.kind, kind)),
    );
}

/** 서빙 화이트리스트 — 이 path 가 사용자의 스프라이트 또는 방 배경으로 등록돼 있는지. */
export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [sprite] = await db
    .select({ id: petSprites.id })
    .from(petSprites)
    .innerJoin(pets, eq(pets.id, petSprites.petId))
    .where(and(eq(pets.userId, userId), eq(petSprites.path, urlPath)))
    .limit(1);
  if (sprite) return true;
  const [bg] = await db
    .select({ id: petRooms.id })
    .from(petRooms)
    .where(and(eq(petRooms.userId, userId), eq(petRooms.backgroundPath, urlPath)))
    .limit(1);
  return !!bg;
}
