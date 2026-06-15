import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { petSprites, pets, petRooms } from "../schema";
import * as roomBackgroundsRepo from "./roomBackgrounds";
import * as petCustomSpritesRepo from "./petCustomSprites";
import * as roomFurnitureRepo from "./roomFurniture";
import * as petItemsRepo from "./petItems";
import * as itemsRepo from "./items";

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

/** 사용자의 모든 펫 스프라이트(전역 펫 목록 아바타용). */
export async function listForUser(userId: number) {
  return db
    .select({
      petId: petSprites.petId,
      stage: petSprites.stage,
      kind: petSprites.kind,
      path: petSprites.path,
    })
    .from(petSprites)
    .innerJoin(pets, eq(pets.id, petSprites.petId))
    .where(eq(pets.userId, userId));
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

/** 서빙 화이트리스트 — 스프라이트·방 배경(스트립)·커스텀 모션·레거시 배경 어디든 사용자 소유면 OK. */
export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [sprite] = await db
    .select({ id: petSprites.id })
    .from(petSprites)
    .innerJoin(pets, eq(pets.id, petSprites.petId))
    .where(and(eq(pets.userId, userId), eq(petSprites.path, urlPath)))
    .limit(1);
  if (sprite) return true;
  if (await roomBackgroundsRepo.pathBelongsToUser(userId, urlPath)) return true;
  if (await petCustomSpritesRepo.pathBelongsToUser(userId, urlPath)) return true;
  if (await roomFurnitureRepo.pathBelongsToUser(userId, urlPath)) return true;
  if (await petItemsRepo.pathBelongsToUser(userId, urlPath)) return true;
  if (await itemsRepo.pathBelongsToUser(userId, urlPath)) return true; // 전역 라이브러리(items)
  // 레거시(이행 전) 배경 경로도 호환.
  const [bg] = await db
    .select({ id: petRooms.id })
    .from(petRooms)
    .where(and(eq(petRooms.userId, userId), eq(petRooms.backgroundPath, urlPath)))
    .limit(1);
  return !!bg;
}
