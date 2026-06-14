import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { cssThemes } from "../schema";

export type CssThemeRow = typeof cssThemes.$inferSelect;

const MAX_PER_USER = 30; // 보관함 상한

export async function listForUser(userId: number) {
  return db
    .select({ id: cssThemes.id, name: cssThemes.name, css: cssThemes.css })
    .from(cssThemes)
    .where(eq(cssThemes.userId, userId))
    .orderBy(desc(cssThemes.createdAt), desc(cssThemes.id));
}

/** 보관함에 추가. 상한 초과면 null. */
export async function create(userId: number, name: string, css: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cssThemes)
    .where(eq(cssThemes.userId, userId));
  if ((n ?? 0) >= MAX_PER_USER) return null;
  const [row] = await db
    .insert(cssThemes)
    .values({ userId, name: name.trim().slice(0, 60) || "테마", css })
    .returning({ id: cssThemes.id, name: cssThemes.name, css: cssThemes.css });
  return row;
}

export async function remove(userId: number, id: number) {
  await db.delete(cssThemes).where(and(eq(cssThemes.id, id), eq(cssThemes.userId, userId)));
}
