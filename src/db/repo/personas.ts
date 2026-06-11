import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { personas } from "../schema";

/** 가입 시 사용자별 기본 페르소나 2인 생성(멱등). */
export async function ensureForUser(userId: number) {
  await db
    .insert(personas)
    .values([
      { userId, id: "theo", displayName: "테오" },
      { userId, id: "nora", displayName: "노라" },
    ])
    .onConflictDoNothing();
}

export async function listByUser(userId: number) {
  return db.query.personas.findMany({ where: eq(personas.userId, userId) });
}

export async function getOne(userId: number, personaId: string) {
  return db.query.personas.findFirst({
    where: and(eq(personas.userId, userId), eq(personas.id, personaId)),
  });
}

export async function updateForUser(
  userId: number,
  personaId: string,
  patch: {
    displayName?: string;
    avatarPath?: string;
    customTraits?: string | null;
  },
) {
  await db
    .update(personas)
    .set(patch)
    .where(and(eq(personas.userId, userId), eq(personas.id, personaId)));
}
