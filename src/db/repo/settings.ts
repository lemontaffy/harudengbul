import { eq } from "drizzle-orm";
import { db } from "../client";
import { settings } from "../schema";

// 전역 choke point — 거의 모든 페이지가 호출. 마이그가 코드보다 뒤처져(새 컬럼 미적용)
//   select 가 실패해도 앱 전체가 죽지 않게 방어: 에러 로깅 후 undefined(→ 호출부가 기본값 사용).
export async function getByUser(userId: number) {
  try {
    return await db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  } catch (e) {
    console.error("[settings.getByUser] 실패(마이그 미적용 등) — 기본값으로:", (e as Error)?.message);
    return undefined;
  }
}

/** proactive 선제 톡 켠 사용자 전부(worker 루프용). */
export async function listProactiveEnabled() {
  return db.select().from(settings).where(eq(settings.proactiveEnabled, true));
}

/** 전체 settings 행(worker 루프용 — 사용자 수 적음). */
export async function listAll() {
  return db.select().from(settings);
}

/** 일기 리마인드 켠 사용자 전부(worker 루프용). */
export async function listDiaryReminderEnabled() {
  return db.select().from(settings).where(eq(settings.diaryReminderEnabled, true));
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
