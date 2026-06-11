import { eq } from "drizzle-orm";
import { db } from "../client";
import { settings } from "../schema";

export async function getByUser(userId: number) {
  return db.query.settings.findFirst({ where: eq(settings.userId, userId) });
}

/** 없으면 빈 행 생성(멱등). 가입 시 호출 — 캐릭터/트리거 기본값은
 *  personasRepo.ensureDefaultsForUser 가 이 행을 채운다(personas 생성 후). */
export async function ensureForUser(userId: number) {
  await db.insert(settings).values({ userId }).onConflictDoNothing();
}

export async function updateByUser(
  userId: number,
  patch: Partial<typeof settings.$inferInsert>,
) {
  await db.update(settings).set(patch).where(eq(settings.userId, userId));
}

export async function setUserAvatar(userId: number, avatarPath: string) {
  await db
    .update(settings)
    .set({ userAvatarPath: avatarPath })
    .where(eq(settings.userId, userId));
}
