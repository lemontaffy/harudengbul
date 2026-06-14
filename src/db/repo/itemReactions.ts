import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { itemReactions } from "../schema";

export type ItemReactionKind = "receive" | "break" | "idle";

/** (이 아이템 × 이 펫 × kind) 캐시된 반응 풀. */
export async function listFor(itemId: number, petId: number, kind: ItemReactionKind): Promise<string[]> {
  const rows = await db
    .select({ content: itemReactions.content })
    .from(itemReactions)
    .where(
      and(eq(itemReactions.itemId, itemId), eq(itemReactions.petId, petId), eq(itemReactions.kind, kind)),
    );
  return rows.map((r) => r.content);
}

/** 이 조합 캐시가 이미 있나(생성 스킵 판정). */
export async function exists(itemId: number, petId: number, kind: ItemReactionKind): Promise<boolean> {
  const [row] = await db
    .select({ id: itemReactions.id })
    .from(itemReactions)
    .where(
      and(eq(itemReactions.itemId, itemId), eq(itemReactions.petId, petId), eq(itemReactions.kind, kind)),
    )
    .limit(1);
  return !!row;
}

/** 풀 저장(생성 1회). 빈 배열이면 무동작. */
export async function addMany(itemId: number, petId: number, kind: ItemReactionKind, contents: string[]) {
  const vals = contents.map((c) => c.trim()).filter(Boolean).slice(0, 8);
  if (vals.length === 0) return;
  await db.insert(itemReactions).values(vals.map((content) => ({ itemId, petId, kind, content })));
}
