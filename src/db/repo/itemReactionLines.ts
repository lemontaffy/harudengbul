import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { itemReactionLines, items } from "../schema";

// 전역 items '주기' 반응 대사 풀 — (itemId × petId × kind) 캐시. 편집(열람/삭제/추가)은 userId 스코프.
//   생성 경로(give API)는 상위에서 item·pet 소유를 이미 검증하므로 ID 직접 조회.

export type ItemReactionLineRow = typeof itemReactionLines.$inferSelect;

/** 캐시 조회 — 이 조합 대사들(content). 상위서 소유 검증된 ID 사용. */
export async function listFor(itemId: number, petId: number, kind: string): Promise<string[]> {
  const rows = await db
    .select({ content: itemReactionLines.content })
    .from(itemReactionLines)
    .where(
      and(
        eq(itemReactionLines.itemId, itemId),
        eq(itemReactionLines.petId, petId),
        eq(itemReactionLines.kind, kind),
      ),
    )
    .orderBy(asc(itemReactionLines.id));
  return rows.map((r) => r.content);
}

/** 풀 저장 — 최대 8개. source 로 auto/manual 구분. */
export async function addMany(
  itemId: number,
  petId: number,
  kind: string,
  source: "auto" | "manual",
  contents: string[],
) {
  const rows = contents.slice(0, 8).map((content) => ({ itemId, petId, kind, source, content }));
  if (rows.length === 0) return;
  await db.insert(itemReactionLines).values(rows);
}

/** 편집용 — 이 (아이템×펫)의 모든 반응 대사(userId 스코프). */
export async function listForPair(userId: number, itemId: number, petId: number) {
  return db
    .select({
      id: itemReactionLines.id,
      kind: itemReactionLines.kind,
      content: itemReactionLines.content,
      source: itemReactionLines.source,
    })
    .from(itemReactionLines)
    .innerJoin(items, eq(items.id, itemReactionLines.itemId))
    .where(
      and(
        eq(items.userId, userId),
        eq(itemReactionLines.itemId, itemId),
        eq(itemReactionLines.petId, petId),
      ),
    )
    .orderBy(asc(itemReactionLines.kind), asc(itemReactionLines.id));
}

/** 편집용 — 이 펫의 모든 아이템 반응 대사(아이템명·consumable 포함, 아이템별 묶기용). userId 스코프. */
export async function listForPet(userId: number, petId: number) {
  return db
    .select({
      id: itemReactionLines.id,
      itemId: itemReactionLines.itemId,
      itemName: items.name,
      consumable: items.consumable,
      kind: itemReactionLines.kind,
      content: itemReactionLines.content,
      source: itemReactionLines.source,
    })
    .from(itemReactionLines)
    .innerJoin(items, eq(items.id, itemReactionLines.itemId))
    .where(and(eq(items.userId, userId), eq(itemReactionLines.petId, petId)))
    .orderBy(asc(items.name), asc(itemReactionLines.kind), asc(itemReactionLines.id));
}

/** 수동 추가(편집). 소유는 라우트가 사전 검증. */
export async function addManual(itemId: number, petId: number, kind: string, content: string) {
  const [row] = await db
    .insert(itemReactionLines)
    .values({ itemId, petId, kind, content, source: "manual" })
    .returning();
  return row;
}

/** 한 줄 삭제 — userId 스코프(item 소유 경유). */
export async function removeOne(userId: number, id: number) {
  const [owned] = await db
    .select({ id: itemReactionLines.id })
    .from(itemReactionLines)
    .innerJoin(items, eq(items.id, itemReactionLines.itemId))
    .where(and(eq(items.userId, userId), eq(itemReactionLines.id, id)))
    .limit(1);
  if (!owned) return;
  await db.delete(itemReactionLines).where(eq(itemReactionLines.id, id));
}
