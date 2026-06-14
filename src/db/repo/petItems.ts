import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import { petItems } from "../schema";

export type PetItemRow = typeof petItems.$inferSelect;

const ITEM_COLS = {
  id: petItems.id,
  roomId: petItems.roomId,
  name: petItems.name,
  spritePath: petItems.spritePath,
  brokenSpritePath: petItems.brokenSpritePath,
  pixelRender: petItems.pixelRender,
  posX: petItems.posX,
  posY: petItems.posY,
  durabilityMax: petItems.durabilityMax,
  durabilityNow: petItems.durabilityNow,
  heldByPetId: petItems.heldByPetId,
};

/** 방의 아이템(방에 둔 것 + 그 방 펫이 든 것). userId 스코프. */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select(ITEM_COLS)
    .from(petItems)
    .where(and(eq(petItems.userId, userId), eq(petItems.roomId, roomId)))
    .orderBy(asc(petItems.id));
}

export async function add(input: {
  userId: number;
  roomId: number | null;
  name: string;
  spritePath: string;
  brokenSpritePath?: string | null;
  pixelRender: boolean;
  durabilityMax: number | null;
  heldByPetId: number | null;
}) {
  const max = input.durabilityMax;
  const [row] = await db
    .insert(petItems)
    .values({
      userId: input.userId,
      roomId: input.roomId,
      name: input.name.trim().slice(0, 60) || "아이템",
      spritePath: input.spritePath,
      brokenSpritePath: input.brokenSpritePath ?? null,
      pixelRender: input.pixelRender,
      durabilityMax: max, // null = 무한
      durabilityNow: max ?? 0, // 처음엔 가득(무한이면 0이지만 무한은 마모 안 함)
      heldByPetId: input.heldByPetId,
    })
    .returning(ITEM_COLS);
  return row;
}

/** 파손 모양 스프라이트 설정/해제(null=해제 → CSS 금 오버레이로 폴백). */
export async function setBrokenSprite(userId: number, id: number, path: string | null) {
  await db
    .update(petItems)
    .set({ brokenSpritePath: path })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId)));
}

export async function getOne(userId: number, id: number) {
  const [row] = await db
    .select(ITEM_COLS)
    .from(petItems)
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function setPosition(userId: number, id: number, posX: number, posY: number) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  await db
    .update(petItems)
    .set({ posX: clamp(posX), posY: clamp(posY) })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId)));
}

export async function setPixel(userId: number, id: number, pixelRender: boolean) {
  await db
    .update(petItems)
    .set({ pixelRender })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId)));
}

export async function setHeldBy(userId: number, id: number, petId: number | null) {
  await db
    .update(petItems)
    .set({ heldByPetId: petId })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId)));
}

/**
 * 마모 1 — durability_now 를 1 줄임(0 미만 금지). 무한(durability_max null)이면 무동작.
 * 반환: 갱신된 durability_now(없거나 무한이면 null).
 */
export async function wear(userId: number, id: number): Promise<number | null> {
  const [row] = await db
    .update(petItems)
    .set({ durabilityNow: sql`greatest(0, ${petItems.durabilityNow} - 1)` })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId), sql`${petItems.durabilityMax} is not null`))
    .returning({ now: petItems.durabilityNow });
  return row?.now ?? null;
}

/** 수리 — durability_now = durability_max(무한이면 무동작). 무료·즉시. */
export async function repair(userId: number, id: number): Promise<boolean> {
  const res = await db
    .update(petItems)
    .set({ durabilityNow: sql`${petItems.durabilityMax}` })
    .where(and(eq(petItems.id, id), eq(petItems.userId, userId), sql`${petItems.durabilityMax} is not null`))
    .returning({ id: petItems.id });
  return res.length > 0;
}

export async function remove(userId: number, id: number) {
  await db.delete(petItems).where(and(eq(petItems.id, id), eq(petItems.userId, userId)));
}

/** 스프라이트 서빙 화이트리스트용 — 이 경로가 이 user 의 아이템(기본/파손 모양) 것인지. */
export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: petItems.id })
    .from(petItems)
    .where(
      and(
        eq(petItems.userId, userId),
        or(eq(petItems.spritePath, urlPath), eq(petItems.brokenSpritePath, urlPath)),
      ),
    )
    .limit(1);
  return !!row;
}
