import { and, asc, eq, or } from "drizzle-orm";
import { db } from "../client";
import { items } from "../schema";

// 전역 아이템/가구 라이브러리(계정 단위). 가구는 furniturePlacements 로 방에 배치, 아이템은 펫에 소유.
//   items 는 user_id 를 직접 가지므로 스코프는 userId 직접 비교.

export type ItemRow = typeof items.$inferSelect;
export type ItemKind = "furniture" | "item";

/** 라이브러리 전체(또는 kind 필터). 최신순. */
export async function listForUser(userId: number, kind?: ItemKind) {
  return db
    .select()
    .from(items)
    .where(kind ? and(eq(items.userId, userId), eq(items.kind, kind)) : eq(items.userId, userId))
    .orderBy(asc(items.kind), asc(items.id));
}

export async function getOne(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 라이브러리에 추가. 가구/아이템 공용 — 해당 kind 에 안 쓰는 필드는 null/기본으로. */
export async function add(
  userId: number,
  input: {
    name: string;
    kind: ItemKind;
    spritePath: string;
    ownerPetId?: number | null;
    pixelRender?: boolean;
    // 가구
    furnitureKind?: "seat" | "fixture" | null;
    type?: string | null;
    spriteAltPath?: string | null;
    actionType?: string | null;
    facing?: "left" | "right";
    seatY?: number;
    // 아이템
    brokenSpritePath?: string | null;
    durabilityMax?: number | null;
    durabilityNow?: number;
  },
) {
  const [row] = await db
    .insert(items)
    .values({
      userId,
      name: input.name,
      kind: input.kind,
      spritePath: input.spritePath,
      ownerPetId: input.ownerPetId ?? null,
      ...(input.pixelRender != null ? { pixelRender: input.pixelRender } : {}),
      furnitureKind: input.furnitureKind ?? null,
      type: input.type ?? null,
      spriteAltPath: input.spriteAltPath ?? null,
      actionType: input.actionType ?? null,
      ...(input.facing ? { facing: input.facing } : {}),
      ...(input.seatY != null ? { seatY: input.seatY } : {}),
      brokenSpritePath: input.brokenSpritePath ?? null,
      durabilityMax: input.durabilityMax ?? null,
      ...(input.durabilityNow != null ? { durabilityNow: input.durabilityNow } : {}),
    })
    .returning();
  return row;
}

/** 메타 수정 — 이름·소유 펫·픽셀 + 가구/아이템 속성. ownerPetId 는 null 명시 가능. */
export async function updateMeta(
  userId: number,
  id: number,
  patch: {
    name?: string;
    ownerPetId?: number | null;
    pixelRender?: boolean;
    furnitureKind?: "seat" | "fixture" | null;
    type?: string | null;
    actionType?: string | null;
    facing?: "left" | "right";
    seatY?: number;
    durabilityMax?: number | null;
    durabilityNow?: number;
  },
) {
  if (Object.keys(patch).length === 0) return;
  await db
    .update(items)
    .set(patch)
    .where(and(eq(items.id, id), eq(items.userId, userId)));
}

/** 스프라이트 교체(main=기본, alt=가구 active, broken=아이템 파손). */
export async function setSprite(
  userId: number,
  id: number,
  slot: "main" | "alt" | "broken",
  path: string,
) {
  const set =
    slot === "main"
      ? { spritePath: path }
      : slot === "alt"
        ? { spriteAltPath: path }
        : { brokenSpritePath: path };
  await db.update(items).set(set).where(and(eq(items.id, id), eq(items.userId, userId)));
}

export async function remove(userId: number, id: number) {
  // furniture_placements 는 item FK cascade — 배치도 함께 삭제됨(라우트가 사전 경고).
  await db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId)));
}

/** 스프라이트 서빙 화이트리스트 — main/alt/broken 어느 경로든 이 유저 소유면 true. */
export async function pathBelongsToUser(userId: number, urlPath: string): Promise<boolean> {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        or(
          eq(items.spritePath, urlPath),
          eq(items.spriteAltPath, urlPath),
          eq(items.brokenSpritePath, urlPath),
        ),
      ),
    )
    .limit(1);
  return !!row;
}
