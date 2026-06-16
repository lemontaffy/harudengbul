import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { sceneBackgrounds } from "../schema";

// 관계 이벤트 장면 배경(전역, 계정 단위). kind: 'love' | 'hostile'. userId 스코프.

export type SceneBgRow = typeof sceneBackgrounds.$inferSelect;

export async function add(userId: number, kind: "love" | "hostile", path: string) {
  const [row] = await db.insert(sceneBackgrounds).values({ userId, kind, path }).returning();
  return row;
}

/** 관리 화면용 — 전체(최신순). */
export async function listForUser(userId: number) {
  return db
    .select()
    .from(sceneBackgrounds)
    .where(eq(sceneBackgrounds.userId, userId))
    .orderBy(asc(sceneBackgrounds.kind), desc(sceneBackgrounds.id));
}

/** 재생용 — 이 톤의 배경 경로들(랜덤 픽은 호출부). */
export async function listPaths(userId: number, kind: "love" | "hostile"): Promise<string[]> {
  const rows = await db
    .select({ path: sceneBackgrounds.path })
    .from(sceneBackgrounds)
    .where(and(eq(sceneBackgrounds.userId, userId), eq(sceneBackgrounds.kind, kind)));
  return rows.map((r) => r.path);
}

export async function remove(userId: number, id: number) {
  await db.delete(sceneBackgrounds).where(and(eq(sceneBackgrounds.id, id), eq(sceneBackgrounds.userId, userId)));
}

/** 스프라이트 서빙 화이트리스트용 — 이 경로가 이 user 의 장면 배경인지. */
export async function pathBelongsToUser(userId: number, url: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sceneBackgrounds.id })
    .from(sceneBackgrounds)
    .where(and(eq(sceneBackgrounds.userId, userId), eq(sceneBackgrounds.path, url)))
    .limit(1);
  return !!row;
}
