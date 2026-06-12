import { and, eq, or } from "drizzle-orm";
import { db } from "../client";
import { petRelations } from "../schema";
import { normalizePair } from "@/lib/pets";

export type PetRelationRow = typeof petRelations.$inferSelect;

/** 관계 선언/수정 — a<b 정규화, (user,a,b) unique 로 upsert. */
export async function upsert(userId: number, p1: number, p2: number, label: string) {
  const { a, b } = normalizePair(p1, p2);
  if (a === b) return;
  await db
    .insert(petRelations)
    .values({ userId, petAId: a, petBId: b, relationLabel: label })
    .onConflictDoUpdate({
      target: [petRelations.userId, petRelations.petAId, petRelations.petBId],
      set: { relationLabel: label },
    });
}

export async function listForUser(userId: number) {
  return db.select().from(petRelations).where(eq(petRelations.userId, userId));
}

export async function listForPet(userId: number, petId: number) {
  return db
    .select()
    .from(petRelations)
    .where(
      and(
        eq(petRelations.userId, userId),
        or(eq(petRelations.petAId, petId), eq(petRelations.petBId, petId)),
      ),
    );
}

export async function removePair(userId: number, p1: number, p2: number) {
  const { a, b } = normalizePair(p1, p2);
  await db
    .delete(petRelations)
    .where(
      and(
        eq(petRelations.userId, userId),
        eq(petRelations.petAId, a),
        eq(petRelations.petBId, b),
      ),
    );
}

/** 두 펫이 같은 라벨군(연인 등)인지 — 탭 이펙트 판정용 헬퍼는 호출부에서 라벨 매칭. */
export async function getPair(userId: number, p1: number, p2: number) {
  const { a, b } = normalizePair(p1, p2);
  return db.query.petRelations.findFirst({
    where: and(
      eq(petRelations.userId, userId),
      eq(petRelations.petAId, a),
      eq(petRelations.petBId, b),
    ),
  });
}
