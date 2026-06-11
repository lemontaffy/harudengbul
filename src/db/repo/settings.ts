import { eq } from "drizzle-orm";
import { db } from "../client";
import { settings } from "../schema";

export async function getByUser(userId: number) {
  return db.query.settings.findFirst({ where: eq(settings.userId, userId) });
}

/** 없으면 기본값으로 생성(멱등). 가입 시 호출. */
export async function ensureForUser(userId: number) {
  await db
    .insert(settings)
    .values({ userId, activePersona: "nora" })
    .onConflictDoNothing();
}

export async function updateByUser(
  userId: number,
  patch: Partial<typeof settings.$inferInsert>,
) {
  await db.update(settings).set(patch).where(eq(settings.userId, userId));
}
