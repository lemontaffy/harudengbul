import { eq } from "drizzle-orm";
import { db } from "../client";
import { appConfig } from "../schema";

/** 전역 OpenRouter 연결 설정(단일행 id=1). 운영자(admin)만 수정. */
export async function get() {
  return db.query.appConfig.findFirst({ where: eq(appConfig.id, 1) });
}

export async function ensure() {
  await db.insert(appConfig).values({ id: 1 }).onConflictDoNothing();
}

export async function update(patch: Partial<typeof appConfig.$inferInsert>) {
  await db.update(appConfig).set(patch).where(eq(appConfig.id, 1));
}
