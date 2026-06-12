import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { petLines, pets } from "../schema";

export type PetLineRow = typeof petLines.$inferSelect;

const COLS = {
  id: petLines.id,
  petId: petLines.petId,
  stage: petLines.stage,
  kind: petLines.kind,
  aboutPetId: petLines.aboutPetId,
  content: petLines.content,
  source: petLines.source,
};

/** 펫 대사 풀(소유 스코프 — pets 조인). stage 지정 시 그 스테이지만. */
export async function listForPet(userId: number, petId: number, stage?: string) {
  return db
    .select(COLS)
    .from(petLines)
    .innerJoin(pets, eq(pets.id, petLines.petId))
    .where(
      and(
        eq(pets.userId, userId),
        eq(petLines.petId, petId),
        ...(stage ? [eq(petLines.stage, stage)] : []),
      ),
    );
}

/** 한 방의 모든 펫 대사(탭 말풍선용). */
export async function listForRoom(userId: number, roomId: number) {
  return db
    .select(COLS)
    .from(petLines)
    .innerJoin(pets, eq(pets.id, petLines.petId))
    .where(and(eq(pets.userId, userId), eq(pets.roomId, roomId)));
}

export async function addManual(
  petId: number,
  stage: string,
  content: string,
  aboutPetId: number | null = null,
) {
  const kind = aboutPetId ? "about_other" : "solo";
  const [row] = await db
    .insert(petLines)
    .values({ petId, stage, kind, aboutPetId, content, source: "manual" })
    .returning();
  return row;
}

/** 개별 삭제 — 소유 확인(해당 라인의 펫이 user 소유인지). */
export async function removeOne(userId: number, id: number) {
  await db
    .delete(petLines)
    .where(
      and(
        eq(petLines.id, id),
        sql`exists (select 1 from ${pets} where ${pets.id} = ${petLines.petId} and ${pets.userId} = ${userId})`,
      ),
    );
}

/** 자동 생성 풀 교체 — 해당 (pet, stage)의 source='auto'만 삭제 후 삽입(수동 대사 보존). */
export async function replaceAuto(
  petId: number,
  stage: string,
  lines: { kind: "solo" | "about_other"; aboutPetId: number | null; content: string }[],
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(petLines)
      .where(
        and(eq(petLines.petId, petId), eq(petLines.stage, stage), eq(petLines.source, "auto")),
      );
    if (lines.length) {
      await tx.insert(petLines).values(
        lines.map((l) => ({
          petId,
          stage,
          kind: l.kind,
          aboutPetId: l.aboutPetId,
          content: l.content,
          source: "auto" as const,
        })),
      );
    }
  });
}
